import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { isPortableError } from '../../../lib/portable';
import { BoxedEditor } from '../BoxedEditor';
import type { BoxedTableRowData } from '../boxed-editor-types';
import {
  addRelationColumn,
  removeRelationColumn,
} from '../commands/rowFactories';
import { BoxedEditorProvider } from '../context/BoxedEditorContext';
import { BoxedEditorUiProvider } from '../context/BoxedEditorUiContext';
import { RelationItemRow } from '../rows/RelationItemRow';
import { createBoxedEditorService } from '../service/createBoxedEditorService';

const languageService = MutableDecisionService;

function queryEditable(container: HTMLElement): HTMLElement {
  const editable = container.querySelector('.cm-content[contenteditable="true"]');
  if (!editable) throw new Error('Could not find a contenteditable CodeMirror element');
  return editable as HTMLElement;
}

function getView(container: HTMLElement): EditorView {
  const dom = container.querySelector('.cm-editor');
  const view = dom && EditorView.findFromDOM(dom as HTMLElement);
  if (!view) throw new Error('Could not find the CodeMirror view');
  return view;
}

function replaceDoc(container: HTMLElement, text: string): void {
  const view = getView(container);
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

describe('row kinds: list', () => {
  it('renders the header and its items, and edits an item value', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode(
      '{ stages: ["review", "approve"] }',
    );
    const service = createBoxedEditorService(mutable);
    const onChange = vi.fn();

    const { container } = render(
      <BoxedEditor
        service={service}
        path="*"
        languageService={languageService}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('stages')).toBeInTheDocument();
    const item0 = service.getBoxedRowData('stages[0]')!;
    const item1 = service.getBoxedRowData('stages[1]')!;
    expect(screen.getByText(item0.value!)).toBeInTheDocument();
    expect(screen.getByText(item1.value!)).toBeInTheDocument();

    await user.click(screen.getByText(item0.value!));
    await user.click(queryEditable(container));
    replaceDoc(container, "'submitted'");
    await user.keyboard('{Enter}');

    expect(mutable.toPortable().stages).toMatchObject({ '@kind': 'expression' });
    expect(
      (mutable.toPortable().stages as { expression: string }).expression,
    ).toContain('submitted');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('appends a blank item via the trailing placeholder without opening a menu', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode(
      '{ stages: ["review", "approve"] }',
    );
    const service = createBoxedEditorService(mutable);
    const onChange = vi.fn();

    render(
      <BoxedEditor
        service={service}
        path="*"
        languageService={languageService}
        onChange={onChange}
      />,
    );

    // Two placeholders render "(new item)" — the list's own and the root model's trailing one;
    // the list's comes first in document order.
    await user.click(screen.getAllByText('(new item)')[0]);

    expect(service.getBoxedRowsData('stages')).toHaveLength(3);
    expect(service.getBoxedRowData('stages[2]')).toMatchObject({
      kind: 'list-item',
      value: "''",
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('hides the placeholder under readOnly', () => {
    const mutable = MutableDecisionService.fromCode('{ stages: ["review"] }');
    const service = createBoxedEditorService(mutable);

    render(<BoxedEditor service={service} path="*" readOnly />);

    expect(screen.queryByText('(new item)')).not.toBeInTheDocument();
  });

  it('duplicates and deletes list items through a whole-parent rewrite', () => {
    const mutable = MutableDecisionService.fromCode(
      '{ stages: ["review", "approve"] }',
    );
    const service = createBoxedEditorService(mutable);
    const listRow = service.getBoxedRowData('stages')!;
    const items = service.getBoxedRowsData('stages');

    const duplicated = [items[0], items[0], items[1]].map((item, index) => ({
      ...item,
      path: `stages[${index}]`,
      name: `Item ${index + 1}`,
    }));
    expect(
      isPortableError(
        service.setBoxedRowData('stages', { ...listRow, children: duplicated }),
      ),
    ).toBe(false);
    expect(service.getBoxedRowsData('stages')).toHaveLength(3);

    const after = service.getBoxedRowsData('stages');
    const deleted = [after[0], after[2]].map((item, index) => ({
      ...item,
      path: `stages[${index}]`,
      name: `Item ${index + 1}`,
    }));
    expect(
      isPortableError(
        service.setBoxedRowData('stages', { ...listRow, children: deleted }),
      ),
    ).toBe(false);
    expect(service.getBoxedRowsData('stages')).toHaveLength(2);
  });
});

describe('row kinds: relation', () => {
  // Homogeneous on purpose: the real engine currently requires every array element to share one
  // identical structural type (see `docs/BUG_REPORTS.md` — "Array-typed fields reject elements
  // with differing optional-field shapes"), so a genuinely heterogeneous record can only be
  // constructed and rendered directly (below), not round-tripped through `MutableDecisionService`.
  const MODEL = `{
    people: [
      { name: "Ada", age: 32 },
      { name: "Lin", age: 28 }
    ]
  }`;

  it('renders column headers and records, and edits a cell value', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode(MODEL);
    const service = createBoxedEditorService(mutable);
    const onChange = vi.fn();

    const { container } = render(
      <BoxedEditor
        service={service}
        path="*"
        languageService={languageService}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('people')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('age')).toBeInTheDocument();
    expect(screen.getByText("'Ada'")).toBeInTheDocument();
    expect(screen.getByText('32')).toBeInTheDocument();

    await user.click(screen.getByText("'Ada'"));
    await user.click(queryEditable(container));
    replaceDoc(container, "'Grace'");
    await user.keyboard('{Enter}');

    expect(mutable.get('people[0].name', 'ALL')).toBe("'Grace'");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('renders an empty cell for a heterogeneous record — never a nested field row', () => {
    // Built directly rather than through the engine — see the engine-limitation note above.
    const secondRow: BoxedTableRowData = {
      kind: 'relation-item',
      depth: 0,
      path: 'people[1]',
      name: 'Item 2',
      columns: ['name', 'age'],
      cells: ["'Lin'", ''],
    };
    expect(secondRow.children ?? []).toHaveLength(0);

    const mutable = MutableDecisionService.fromCode(MODEL);
    const service = createBoxedEditorService(mutable);
    render(
      <BoxedEditorProvider
        service={service}
        readOnly={false}
        showDescription={false}
        showTestResults={false}
        showType={false}
        autoRunTests={false}
        languageService={languageService}
      >
        <BoxedEditorUiProvider>
          <RelationItemRow row={secondRow} />
        </BoxedEditorUiProvider>
      </BoxedEditorProvider>,
    );

    expect(screen.getByText("'Lin'")).toBeInTheDocument();
    // The missing `age` column renders as an empty cell — never its own "age" field row.
    expect(screen.queryByText('age')).not.toBeInTheDocument();
  });

  it('appends a blank row via the trailing placeholder', async () => {
    // A single string-typed column: the placeholder's blank cell defaults to `""`, which matches
    // a `string`-typed column (see `appendRelationItem`'s doc comment) — the one shape the engine
    // bug above still lets a blank append round-trip through.
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode(
      '{ people: [{ name: "Ada" }, { name: "Lin" }] }',
    );
    const service = createBoxedEditorService(mutable);
    const onChange = vi.fn();

    render(
      <BoxedEditor
        service={service}
        path="*"
        languageService={languageService}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText('(new row)'));

    const rows = service.getBoxedRowsData('people') as BoxedTableRowData[];
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({
      kind: 'relation-item',
      columns: ['name'],
      cells: ["''"],
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('adds and removes a column across the header and every record', () => {
    // Backfilled on every record: the engine bug above rejects a column present on some records
    // but not others, so exercising add/remove here keeps every record's shape identical.
    const mutable = MutableDecisionService.fromCode(MODEL);
    const service = createBoxedEditorService(mutable);
    const relation = service.getBoxedRowData('people') as BoxedTableRowData;
    const children = service.getBoxedRowsData('people') as BoxedTableRowData[];

    const withColumn = addRelationColumn({ ...relation, children }, 'status');
    withColumn.children = withColumn.children!.map((child, index) => ({
      ...(child as BoxedTableRowData),
      cells: [...(child as BoxedTableRowData).cells!.slice(0, 2), `'status${index}'`],
    }));
    expect(isPortableError(service.setBoxedRowData('people', withColumn))).toBe(false);
    expect(service.getBoxedRowData('people')).toMatchObject({
      columns: ['name', 'age', 'status'],
    });
    expect(service.getBoxedRowsData('people')[0]).toMatchObject({
      cells: ["'Ada'", '32', "'status0'"],
    });
    expect(service.getBoxedRowsData('people')[1]).toMatchObject({
      cells: ["'Lin'", '28', "'status1'"],
    });

    const afterAdd = service.getBoxedRowData('people') as BoxedTableRowData;
    const childrenAfterAdd = service.getBoxedRowsData('people') as BoxedTableRowData[];
    const withoutColumn = removeRelationColumn(
      { ...afterAdd, children: childrenAfterAdd },
      'age',
    );
    expect(isPortableError(service.setBoxedRowData('people', withoutColumn))).toBe(false);
    expect(service.getBoxedRowData('people')).toMatchObject({
      columns: ['name', 'status'],
    });
    expect(service.getBoxedRowsData('people')[0]).toMatchObject({
      cells: ["'Ada'", "'status0'"],
    });
  });

  it('renders a complex cell value as a drill-down, never as JSON text', () => {
    const mutable = MutableDecisionService.fromCode(`{
      offices: [
        { id: 1, address: { city: "Vilnius" } }
      ]
    }`);
    const service = createBoxedEditorService(mutable);
    const item = service.getBoxedRowData('offices[0]') as BoxedTableRowData;

    expect(item).toMatchObject({
      kind: 'relation-item',
      columns: ['id', 'address'],
      cells: ['1', ''],
    });

    render(
      <BoxedEditor service={service} path="offices" languageService={languageService} />,
    );

    expect(screen.getByText('address')).toBeInTheDocument();
    expect(screen.getByText("'Vilnius'")).toBeInTheDocument();
    expect(screen.queryByText(/"city"/)).not.toBeInTheDocument();
  });
});

describe('row kinds: computed array', () => {
  it('renders a loop expression as a single field row, never as list items', () => {
    const mutable = MutableDecisionService.fromCode(
      '{ doubled: for x in [1, 2, 3] return x * 2 }',
    );
    const service = createBoxedEditorService(mutable);
    const row = service.getBoxedRowData('doubled')!;

    expect(row.kind).toBe('field');
    expect(row.value).toContain('for');

    render(
      <BoxedEditor service={service} path="*" languageService={languageService} />,
    );

    expect(screen.getByText(row.value!)).toBeInTheDocument();
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  });
});
