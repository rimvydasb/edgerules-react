import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PortableRootContext } from '@edgerules/portable';
import { BoxedEditorProvider } from '../BoxedEditorProvider';
import { BoxedEntityNode, BoxedNode } from '../BoxedNode';
import type { BoxedRenderNode } from '../boxed-model';
import { ContextBox } from '../boxes/ContextBox';
import { EditorLinkBox } from '../boxes/EditorLinkBox';
import { ExpressionBox } from '../boxes/ExpressionBox';
import { ExternalFunctionBox } from '../boxes/ExternalFunctionBox';
import { FunctionBox } from '../boxes/FunctionBox';
import { InputBox } from '../boxes/InputBox';
import { InvocationBox } from '../boxes/InvocationBox';
import { ListBox } from '../boxes/ListBox';
import { RelationBox } from '../boxes/RelationBox';

const noop = vi.fn();

function renderDomainBox(
  element: ReactElement,
  path: string,
  overrides: Record<string, unknown> = {},
) {
  const commands = {
    expression: {
      activePath: null,
      activate: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
    },
    field: {
      editingPath: null,
      nameDraft: '',
      setNameDraft: vi.fn(),
      startRename: vi.fn(),
      commitRename: vi.fn(),
      duplicate: vi.fn(),
      remove: vi.fn(),
      add: vi.fn(),
    },
    metadata: {
      activePath: null,
      activate: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
    },
    functions: { editSignature: vi.fn() },
    invocation: { edit: vi.fn() },
    list: {
      addItem: vi.fn(),
      duplicateItem: vi.fn(),
      removeItem: vi.fn(),
      loadMore: vi.fn(),
    },
    relation: { editColumn: vi.fn() },
    navigation: { open: vi.fn() },
    ...overrides,
  };
  render(
    <BoxedEditorProvider
      state={{
        readOnly: false,
        snapshot: {} as PortableRootContext,
        languageService: { diagnostics: () => [] },
        expanded: new Set([path]),
        errors: { [path]: `${path} error` },
        toggle: noop,
      }}
      expression={commands.expression}
      field={commands.field}
      metadata={commands.metadata}
      functions={commands.functions}
      invocation={commands.invocation}
      list={commands.list}
      relation={commands.relation}
      navigation={commands.navigation}
      renderer={BoxedEntityNode}
    >
      {element}
    </BoxedEditorProvider>,
  );
  return commands;
}

function node<T extends BoxedRenderNode>(value: T): T {
  return value;
}

describe('boxed-editor domain boxes', () => {
  it('BoxedNode exhaustively dispatches every normalized entity kind', () => {
    const nodes: BoxedRenderNode[] = [
      {
        id: 'context',
        path: 'context',
        kind: 'context',
        authored: { '@kind': 'context' },
      },
      {
        id: 'expression',
        path: 'expression',
        kind: 'expression',
        authored: '1',
      },
      {
        id: 'input',
        path: 'input',
        kind: 'input',
        authored: { '@kind': 'type', type: 'number' },
      },
      {
        id: 'list',
        path: 'list',
        kind: 'list',
        authored: [],
        list: { loaded: 0, terminal: true },
      },
      {
        id: 'relation',
        path: 'relation',
        kind: 'relation',
        authored: [],
        list: { loaded: 0, terminal: true },
      },
      {
        id: 'function',
        path: 'function',
        kind: 'function',
        authored: {
          '@kind': 'function',
          '@parameters': {},
          '@body': { '@kind': 'expression', expression: '1' },
        },
      },
      {
        id: 'external',
        path: 'external',
        kind: 'external-function',
        authored: {
          '@kind': 'external-function',
          '@parameters': {},
          '@return': 'any',
        },
      },
      {
        id: 'invocation',
        path: 'invocation',
        kind: 'invocation',
        authored: { '@kind': 'invocation', '@method': 'f', '@arguments': [] },
      },
      {
        id: 'link',
        path: 'link',
        kind: 'editor-link',
        authored: { '@kind': 'type-definition' },
      },
    ];
    renderDomainBox(
      <>
        {nodes.map((item) => (
          <BoxedNode key={item.id} node={item} />
        ))}
      </>,
      '*',
    );
    for (const item of nodes)
      expect(screen.getByRole('row', { name: item.path })).toBeInTheDocument();
  });

  it('ContextBox renders context semantics, its path error, and only context/field commands', async () => {
    const value = node({
      id: 'box',
      path: 'box',
      name: 'box',
      kind: 'context',
      authored: { '@kind': 'context' },
      children: [],
    });
    const commands = renderDomainBox(
      <ContextBox node={value} depth={0} />,
      value.path,
    );
    expect(screen.getByText('Empty context')).toBeInTheDocument();
    expect(screen.getByText('box error')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Add field to box' }),
    );
    expect(commands.field.add).toHaveBeenCalledWith(value);
    expect(
      screen.queryByRole('button', { name: /signature/i }),
    ).not.toBeInTheDocument();
  });

  it('ExpressionBox renders a static expression, reports its error, and activates only expression editing', async () => {
    const value = node({
      id: 'answer',
      path: 'answer',
      name: 'answer',
      kind: 'expression',
      authored: '1 + 2',
    });
    const commands = renderDomainBox(
      <ExpressionBox node={value} depth={0} />,
      value.path,
    );
    expect(screen.getByRole('row', { name: 'answer' })).toHaveTextContent(
      '1 + 2',
    );
    expect(screen.getByText('answer error')).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('row', { name: 'answer' })).getAllByRole(
        'cell',
      )[3],
    );
    expect(commands.expression.activate).toHaveBeenCalledWith(value);
    expect(
      screen.queryByRole('button', { name: /signature/i }),
    ).not.toBeInTheDocument();
  });

  it('InputBox renders its DSL input and activates inline cell editing', async () => {
    const value = node({
      id: 'amount',
      path: 'amount',
      name: 'amount',
      kind: 'input',
      authored: { '@kind': 'type', type: 'number', required: true },
    });
    const commands = renderDomainBox(
      <InputBox node={value} depth={0} />,
      value.path,
    );
    expect(screen.getByText('amount error')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: 'amount' });
    expect(row).toHaveTextContent('<number, required: true>');
    await userEvent.click(within(row).getAllByRole('cell')[3]);
    expect(commands.expression.activate).toHaveBeenCalledWith(value);
    expect(
      screen.queryByRole('button', { name: /invocation/i }),
    ).not.toBeInTheDocument();
  });

  it('FunctionBox owns signature/body presentation and the function command', async () => {
    const child = node({
      id: 'monthly.result',
      path: 'monthly.result',
      name: 'result',
      kind: 'expression',
      authored: 'amount / 12',
    });
    const value = node({
      id: 'monthly',
      path: 'monthly',
      name: 'monthly',
      kind: 'function',
      authored: {
        '@kind': 'function',
        '@parameters': { amount: 'number' },
        '@body': { '@kind': 'expression', expression: 'amount / 12' },
      },
      children: [child],
    });
    const commands = renderDomainBox(
      <FunctionBox node={value} depth={0} />,
      value.path,
    );
    expect(
      screen.getByText('func monthly(amount: number)'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: 'monthly.result' }),
    ).toBeInTheDocument();
    expect(screen.getByText('monthly error')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit signature monthly' }),
    );
    expect(commands.functions.editSignature).toHaveBeenCalledWith(value);
    expect(
      screen.queryByRole('button', { name: 'Add item to monthly' }),
    ).not.toBeInTheDocument();
  });

  it('ExternalFunctionBox renders and edits only an external signature', async () => {
    const value = node({
      id: 'lookup',
      path: 'lookup',
      name: 'lookup',
      kind: 'external-function',
      authored: {
        '@kind': 'external-function',
        '@parameters': { id: 'string' },
        '@return': 'string',
      },
    });
    const commands = renderDomainBox(
      <ExternalFunctionBox node={value} depth={0} />,
      value.path,
    );
    expect(
      screen.getByText('external func lookup(id: string) → string'),
    ).toBeInTheDocument();
    expect(screen.getByText('lookup error')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit signature lookup' }),
    );
    expect(commands.functions.editSignature).toHaveBeenCalledWith(value);
  });

  it('InvocationBox composes InvocationArgumentBox children and owns invocation-wide editing', async () => {
    const argument = node({
      id: 'payment.@arguments[0]',
      path: 'payment.@arguments[0]',
      name: 'Argument 1',
      kind: 'expression',
      authored: 'amount',
      invocation: { path: 'payment', argument: 0 },
    });
    const value = node({
      id: 'payment',
      path: 'payment',
      name: 'payment',
      kind: 'invocation',
      authored: {
        '@kind': 'invocation',
        '@method': 'monthly',
        '@arguments': ['amount'],
      },
      children: [argument],
    });
    const commands = renderDomainBox(
      <InvocationBox node={value} depth={0} />,
      value.path,
    );
    expect(screen.getByRole('row', { name: argument.path })).toHaveTextContent(
      'amount',
    );
    expect(screen.getByText('payment error')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit invocation payment' }),
    );
    expect(commands.invocation.edit).toHaveBeenCalledWith(value);
    expect(
      within(screen.getByRole('row', { name: argument.path })).queryByRole(
        'button',
        { name: /rename/i },
      ),
    ).not.toBeInTheDocument();
  });

  it('ListBox composes ListItemBox and routes only collection/item commands', async () => {
    const item = node({
      id: 'nums[0]',
      path: 'nums[0]',
      name: 'Item 1',
      kind: 'expression',
      authored: '1',
      listItem: { path: 'nums', index: 0 },
    });
    const value = node({
      id: 'nums',
      path: 'nums',
      name: 'nums',
      kind: 'list',
      authored: [],
      children: [item],
      list: { loaded: 1, terminal: true },
    });
    const commands = renderDomainBox(
      <ListBox node={value} depth={0} />,
      value.path,
    );
    expect(screen.getByText('1 list items')).toBeInTheDocument();
    expect(screen.getByText('nums error')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Add item to nums' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete nums[0]' }),
    );
    expect(commands.list.addItem).toHaveBeenCalledWith(value);
    expect(commands.list.removeItem).toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /column/i }),
    ).not.toBeInTheDocument();
  });

  it('RelationBox composes RelationRowBox and owns relation column commands', async () => {
    const row = node({
      id: 'people[0]',
      path: 'people[0]',
      name: 'Row 1',
      kind: 'context',
      authored: { '@kind': 'context', name: '"Ada"' },
      children: [],
      listItem: { path: 'people', index: 0 },
    });
    const value = node({
      id: 'people',
      path: 'people',
      name: 'people',
      kind: 'relation',
      authored: [],
      children: [row],
      list: { loaded: 1, terminal: true },
    });
    const commands = renderDomainBox(
      <RelationBox node={value} depth={0} />,
      value.path,
    );
    expect(screen.getByRole('row', { name: 'people[0]' })).toHaveTextContent(
      'Row 1',
    );
    expect(screen.getByText('people error')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Add column to people' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete people[0]' }),
    );
    expect(commands.relation.editColumn).toHaveBeenCalledWith(value, 'add');
    expect(commands.list.removeItem).toHaveBeenCalled();
  });

  it('EditorLinkBox renders its route and depends only on navigation', async () => {
    const value = node({
      id: 'Applicant',
      path: 'Applicant',
      name: 'Applicant',
      kind: 'editor-link',
      authored: { '@kind': 'type-definition' },
    });
    const commands = renderDomainBox(
      <EditorLinkBox node={value} depth={0} />,
      value.path,
    );
    expect(screen.getByText('Applicant error')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open Types Editor' }),
    );
    expect(commands.navigation.open).toHaveBeenCalledWith({
      path: 'Applicant',
      kind: 'type-definition',
    });
    expect(
      screen.queryByRole('button', { name: /metadata/i }),
    ).not.toBeInTheDocument();
  });
});
