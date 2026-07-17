import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { BoxedEditor } from '../BoxedEditor';

const MODEL = `{
  type Applicant: { age: <number> }
  application: { amount: <number, required: true> nested: { score: amount * 2 } }
  func monthly(amount: number) -> number: amount / 12
  external func lookup(id: string) -> string
  payment: monthly(application.amount)
}`;

function service() {
  return MutableDecisionService.fromCode(MODEL);
}

describe('BoxedEditor', () => {
  it('renders root fields in authored order with static expression text and inferred labels', () => {
    render(<BoxedEditor service={service()} path="*" readOnly />);
    expect(screen.getByRole('treegrid')).toBeInTheDocument();
    expect(screen.getByText('Applicant')).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: 'application' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('func monthly(amount: number) → number'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('external func lookup(id: string) → string'),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'payment' })).toHaveTextContent(
      'monthly(application.amount)',
    );
    expect(screen.getByText('number')).toBeInTheDocument();
  });

  it('supports expanding and collapsing nested contexts', async () => {
    const user = userEvent.setup();
    render(<BoxedEditor service={service()} path="*" readOnly />);
    expect(
      screen.queryByRole('row', { name: 'application.amount' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Expand application' }),
    );
    expect(
      screen.getByRole('row', { name: 'application.amount' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Collapse application' }),
    );
    expect(
      screen.queryByRole('row', { name: 'application.amount' }),
    ).not.toBeInTheDocument();
  });

  it('renders leading drag handles for authored sibling fields only in editable mode', () => {
    render(<BoxedEditor service={service()} path="*" />);
    expect(
      screen.getByRole('button', { name: 'Drag application' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Drag monthly' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Drag *' }),
    ).not.toBeInTheDocument();
  });

  it('focuses a selected authored path and maps function bodies from CRUD paths', () => {
    render(<BoxedEditor service={service()} path="monthly" readOnly />);
    expect(
      screen.getByText('func monthly(amount: number) → number'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: 'monthly.result' }),
    ).toHaveTextContent('amount / 12');
  });

  it('maps context-function body fields to their CRUD paths', () => {
    const instance = MutableDecisionService.fromCode(`{
      func summary(amount: number): {
        tax: amount * 0.2
        result: amount + tax
      }
    }`);
    render(<BoxedEditor service={instance} path="summary" readOnly />);
    expect(screen.getByRole('row', { name: 'summary.tax' })).toHaveTextContent(
      'amount * 0.2',
    );
    expect(
      screen.getByRole('row', { name: 'summary.result' }),
    ).toHaveTextContent('amount + tax');
  });

  it('routes specialized definitions while read-only', async () => {
    const onOpenNode = vi.fn();
    const user = userEvent.setup();
    render(
      <BoxedEditor
        service={service()}
        path="*"
        readOnly
        onOpenNode={onOpenNode}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open Types Editor' }));
    expect(onOpenNode).toHaveBeenCalledWith({
      path: 'Applicant',
      kind: 'type-definition',
    });
  });

  it('routes type, ruleset, and loop definitions with their exact authored paths', async () => {
    const onOpenNode = vi.fn();
    const user = userEvent.setup();
    const instance = MutableDecisionService.fromCode(`{
      type Applicant: { age: <number> }
      ruleset risk(age: number): {
        hitPolicy: "first-match"
        rules: [{ when: { age: 1..100 }, then: { eligible: true } }]
        default: { eligible: false }
      }
      loop counter(x: number): {
        state: { n: x }
        while: state.n > 0
        maxIterations: 10
        do: { n: state.n - 1 }
        return: state.n
      }
    }`);
    render(
      <BoxedEditor
        service={instance}
        path="*"
        readOnly
        onOpenNode={onOpenNode}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open Types Editor' }));
    await user.click(
      screen.getByRole('button', { name: 'Open Decision Table Editor' }),
    );
    await user.click(screen.getByRole('button', { name: 'Open Loop Editor' }));

    expect(onOpenNode).toHaveBeenNthCalledWith(1, {
      path: 'Applicant',
      kind: 'type-definition',
    });
    expect(onOpenNode).toHaveBeenNthCalledWith(2, {
      path: 'risk',
      kind: 'ruleset',
    });
    expect(onOpenNode).toHaveBeenNthCalledWith(3, {
      path: 'counter',
      kind: 'loop',
    });
  });

  it('commits an expression through one active CodeEditorCell and emits the refreshed snapshot', async () => {
    const user = userEvent.setup();
    const instance = MutableDecisionService.fromCode('{ answer: 1 }');
    const onChange = vi.fn();
    const { container } = render(
      <BoxedEditor service={instance} path="*" onChange={onChange} />,
    );

    await user.click(
      within(screen.getByRole('row', { name: 'answer' })).getAllByRole(
        'cell',
      )[3],
    );
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(1);
    const editor = container.querySelector<HTMLElement>('.cm-content');
    expect(editor).not.toBeNull();
    await user.click(editor!);
    await user.keyboard('{Control>}a{/Control}1 + 2{Enter}');

    expect(instance.toPortable().answer).toMatchObject({
      '@kind': 'expression',
      expression: '1 + 2',
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(0);
  });

  it('edits a scalar function body through its owning function definition', async () => {
    const user = userEvent.setup();
    const instance = service();
    const onChange = vi.fn();
    const { container } = render(
      <BoxedEditor service={instance} path="*" onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Expand monthly' }));
    await user.click(
      within(screen.getByRole('row', { name: 'monthly.result' })).getAllByRole(
        'cell',
      )[3],
    );
    const editor = container.querySelector<HTMLElement>('.cm-content');
    expect(editor).toHaveTextContent('amount / 12');
    await user.click(editor!);
    await user.keyboard('{Control>}a{/Control}amount / 6{Enter}');

    expect(instance.toPortable().monthly).toMatchObject({
      '@kind': 'function',
      '@parameters': { amount: 'number' },
      '@return': 'number',
      '@body': { '@kind': 'expression', expression: 'amount / 6' },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(0);
    expect(
      screen.getByRole('row', { name: 'monthly.result' }),
    ).toHaveTextContent('amount / 6');
  });

  it('writes complete typed inputs and supports context add, rename, duplicate, and delete', async () => {
    const user = userEvent.setup();
    const instance = service();
    const { container } = render(<BoxedEditor service={instance} path="*" />);

    await user.click(
      screen.getByRole('button', { name: 'Expand application' }),
    );
    const amountRow = screen.getByRole('row', { name: 'application.amount' });
    await user.click(within(amountRow).getAllByRole('cell')[3]);
    const inputEditor = container.querySelector<HTMLElement>('.cm-content');
    expect(inputEditor).toHaveTextContent('<number, required: true>');
    await user.click(inputEditor!);
    await user.keyboard('{Control>}a{/Control}<number>{Enter}');
    expect(instance.toPortable().application as object).toMatchObject({
      amount: { '@kind': 'type', type: 'number' },
    });
    expect(container.querySelector('.cm-editor')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Add field to application' }),
    );
    const addDialog = screen.getByRole('dialog');
    await user.type(within(addDialog).getByLabelText('Name'), 'fee');
    await user.click(
      within(addDialog).getByRole('button', { name: 'Add field' }),
    );
    expect(instance.toPortable().application as object).toHaveProperty(
      'fee',
      0,
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const feeRow = screen.getByRole('row', { name: 'application.fee' });
    expect(
      within(feeRow).queryByRole('button', {
        name: 'Rename application.fee',
      }),
    ).not.toBeInTheDocument();
    await user.click(
      within(feeRow).getByRole('button', {
        name: 'Edit name application.fee',
      }),
    );
    const name = screen.getByLabelText('Name application.fee');
    await user.clear(name);
    await user.type(name, 'serviceFee');
    await user.keyboard('{Enter}');
    expect(instance.toPortable().application as object).toHaveProperty(
      'serviceFee',
      0,
    );

    await user.click(
      screen.getByRole('button', { name: 'Duplicate application.serviceFee' }),
    );
    expect(instance.toPortable().application as object).toHaveProperty(
      'serviceFeeCopy',
      0,
    );
    await user.click(
      screen.getByRole('button', { name: 'Delete application.serviceFeeCopy' }),
    );
    expect(instance.toPortable().application as object).not.toHaveProperty(
      'serviceFeeCopy',
    );
  });

  it('changes a cell from number to input to string through one inline editor', async () => {
    const user = userEvent.setup();
    const instance = service();
    instance.set('mutable', '1');
    const { container } = render(<BoxedEditor service={instance} path="*" />);

    const edit = async (initial: string, next: string) => {
      const row = screen.getByRole('row', { name: 'mutable' });
      await user.click(within(row).getAllByRole('cell')[3]);
      const editor = container.querySelector<HTMLElement>('.cm-content');
      expect(editor).toHaveTextContent(initial);
      await user.click(editor!);
      await user.keyboard(`{Control>}a{/Control}${next}{Enter}`);
      expect(container.querySelector('.cm-editor')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    };

    await edit('1', '<number, 5>');
    expect(instance.toPortable().mutable).toEqual({
      '@kind': 'type',
      type: 'number',
      default: 5,
    });
    expect(screen.getByRole('row', { name: 'mutable' })).toHaveTextContent(
      'number · input',
    );

    await edit('<number, default: 5>', '"text"');
    expect(instance.toPortable().mutable).toBe("'text'");
    expect(screen.getByRole('row', { name: 'mutable' })).toHaveTextContent(
      'string · computed',
    );
  });

  it('removes all mutation affordances in read-only mode', () => {
    render(<BoxedEditor service={service()} path="*" readOnly />);
    expect(
      screen.queryByRole('button', { name: 'Edit payment' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add field to *' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rename payment' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Drag / }),
    ).not.toBeInTheDocument();
  });

  it('rolls back a rename when linked validation exposes an unresolved reference', async () => {
    const user = userEvent.setup();
    const instance = service();
    const onChange = vi.fn();
    render(<BoxedEditor service={instance} path="*" onChange={onChange} />);
    await user.click(
      screen.getByRole('button', { name: 'Expand application' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Rename application.amount' }),
    );
    const name = screen.getByLabelText('Name application.amount');
    await user.clear(name);
    await user.type(name, 'principal');
    await user.keyboard('{Enter}');

    expect(instance.toPortable().application as object).toHaveProperty(
      'amount',
    );
    expect(instance.toPortable().application as object).not.toHaveProperty(
      'principal',
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(/unresolved reference 'amount'/),
    ).toBeInTheDocument();
  });

  it('writes complete function and external signatures and preserves function bodies', async () => {
    const user = userEvent.setup();
    const instance = MutableDecisionService.fromCode(`{
      func monthly(amount: number): amount / 12
      external func lookup(id: string) -> string
    }`);
    render(<BoxedEditor service={instance} path="*" />);

    await user.click(
      screen.getByRole('button', { name: 'Edit signature monthly' }),
    );
    const functionDialog = screen.getByRole('dialog');
    await user.click(
      within(functionDialog).getByRole('button', { name: 'Add parameter' }),
    );
    await user.type(
      within(functionDialog).getByLabelText('Parameter 2 name'),
      'fee',
    );
    await user.click(
      within(functionDialog).getByRole('button', { name: 'Save signature' }),
    );
    expect(instance.toPortable().monthly).toMatchObject({
      '@kind': 'function',
      '@parameters': { amount: 'number', fee: 'number' },
      '@body': { '@kind': 'expression', expression: 'amount / 12' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', { name: 'Edit signature lookup' }),
    );
    const externalDialog = screen.getByRole('dialog');
    await user.clear(within(externalDialog).getByLabelText('Return type'));
    await user.type(
      within(externalDialog).getByLabelText('Return type'),
      'number',
    );
    await user.click(
      within(externalDialog).getByRole('button', { name: 'Save signature' }),
    );
    expect(instance.toPortable().lookup).toMatchObject({
      '@kind': 'external-function',
      '@parameters': { id: 'string' },
      '@return': 'number',
    });
  });

  it('edits an invocation as one DSL cell and edits metadata', async () => {
    const user = userEvent.setup();
    const instance = service();
    instance.set('payment', {
      '@kind': 'invocation',
      '@method': 'monthly',
      '@arguments': ['application.amount'],
    });
    const { container } = render(<BoxedEditor service={instance} path="*" />);

    const invocationRow = screen.getByRole('row', { name: 'payment' });
    expect(invocationRow).toHaveTextContent('monthly(application.amount)');
    expect(
      screen.queryByRole('button', { name: 'Expand payment' }),
    ).not.toBeInTheDocument();
    await user.click(within(invocationRow).getAllByRole('cell')[3]);
    const editor = container.querySelector<HTMLElement>('.cm-content');
    expect(editor).not.toBeNull();
    expect(editor).toHaveTextContent('monthly(application.amount)');
    await user.click(editor!);
    await user.keyboard(
      '{Control>}a{/Control}monthly(application.amount * 2){Enter}',
    );
    expect(instance.toPortable().payment).toMatchObject({
      '@kind': 'invocation',
      '@method': 'monthly',
      '@arguments': ['application.amount * 2'],
    });

    await user.click(
      screen.getByRole('button', { name: 'Edit metadata application' }),
    );
    const metadataEditor = container.querySelector<HTMLElement>('.cm-content');
    expect(metadataEditor).not.toBeNull();
    await user.click(metadataEditor!);
    await user.keyboard('@ChartNode(name: "Application"){Enter}');
    expect(instance.toPortable().application).toMatchObject({
      '@node': 'ChartNode',
      '@node-name': 'Application',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('pages and edits CRUD-addressable scalar lists without expanding computed arrays', async () => {
    const user = userEvent.setup();
    const values = Array.from({ length: 120 }, (_, index) => index + 1).join(
      ', ',
    );
    const instance = MutableDecisionService.fromCode(
      `{ nums: [${values}] computed: range(1, 3) }`,
    );
    const { container } = render(<BoxedEditor service={instance} path="*" />);

    await user.click(screen.getByRole('button', { name: 'Expand nums' }));
    expect(screen.getByRole('row', { name: 'nums[0]' })).toHaveTextContent('1');
    expect(
      screen.queryByRole('button', { name: 'Drag nums[0]' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Load more' })).toHaveLength(
      1,
    );
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getByLabelText('Virtualized rows nums')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add item to nums' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Drag nums[0]' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add item to computed' }),
    ).not.toBeInTheDocument();

    const item = screen.getByRole('row', { name: 'nums[0]' });
    await user.click(within(item).getAllByRole('cell')[3]);
    const editor = container.querySelector<HTMLElement>('.cm-content');
    expect(editor).not.toBeNull();
    await user.click(editor!);
    await user.keyboard('{Control>}a{/Control}20{Enter}');
    expect(
      (instance.toPortable().nums as { expression: string }).expression,
    ).toMatch(/^\[20,/);
    await user.click(screen.getByRole('button', { name: 'Duplicate nums[0]' }));
    expect(
      (instance.toPortable().nums as { expression: string }).expression,
    ).toMatch(/120, 20\]$/);
  });

  it('renders literal record lists as relations and writes row and column changes atomically', async () => {
    const user = userEvent.setup();
    const instance = MutableDecisionService.fromCode(`{
      people: [{ name: "A"; age: 1 }, { name: "B"; age: 2 }]
    }`);
    render(<BoxedEditor service={instance} path="*" />);

    await user.click(screen.getByRole('button', { name: 'Expand people' }));
    const table = screen.getByRole('table', { name: 'people relationship' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(expect.arrayContaining(['name', 'age']));
    expect(screen.getByRole('row', { name: 'people[0]' })).toHaveTextContent(
      "'A'1",
    );
    expect(screen.queryByText('Row 1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add row to people' }));
    const rowDialog = screen.getByRole('dialog');
    await user.clear(within(rowDialog).getByLabelText('name expression'));
    await user.type(within(rowDialog).getByLabelText('name expression'), '"C"');
    await user.clear(within(rowDialog).getByLabelText('age expression'));
    await user.type(within(rowDialog).getByLabelText('age expression'), '3');
    await user.click(within(rowDialog).getByRole('button', { name: 'Add' }));
    expect(
      (instance.toPortable().people as { expression: string }).expression,
    ).toContain('name: "C"');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', { name: 'Add column to people' }),
    );
    const columnDialog = screen.getByRole('dialog');
    await user.type(
      within(columnDialog).getByLabelText('Column name'),
      'active',
    );
    await user.clear(within(columnDialog).getByLabelText('Default expression'));
    await user.type(
      within(columnDialog).getByLabelText('Default expression'),
      'true',
    );
    await user.click(
      within(columnDialog).getByRole('button', { name: 'Save column' }),
    );
    expect(
      (instance.toPortable().people as { expression: string }).expression,
    ).toContain('active: true');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Edit column name people.active',
      }),
    );
    const columnName = screen.getByLabelText('Column name people.active');
    await user.clear(columnName);
    await user.type(columnName, 'enabled{Enter}');
    expect(
      (instance.toPortable().people as { expression: string }).expression,
    ).toContain('enabled: true');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Delete people[0]' }));
    expect(
      (instance.toPortable().people as { expression: string }).expression,
    ).not.toContain('name: "A"');
  });
});
