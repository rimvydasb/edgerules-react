import type {ReactElement} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {EditorView} from '@codemirror/view';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {isPortableError} from '../../../lib/portable';
import {BoxedEditor} from '../BoxedEditor';
import type {BoxedRowData, BoxedTableRowData} from '../boxed-editor-types';
import {addRelationColumn, appendOptimisationVariable, removeRelationColumn} from '../commands/rowFactories';
import {BoxedEditorProvider} from '../context/BoxedEditorContext';
import {BoxedEditorUiProvider} from '../context/BoxedEditorUiContext';
import {FunctionResultRow} from '../rows/FunctionResultRow';
import {OptimisationConstraintGroupRow} from '../rows/OptimisationConstraintGroupRow';
import {OptimisationConstraintRow} from '../rows/OptimisationConstraintRow';
import {OptimisationObjectiveRow} from '../rows/OptimisationObjectiveRow';
import {OptimisationSettingRow} from '../rows/OptimisationSettingRow';
import {OptimisationVariableGroupRow} from '../rows/OptimisationVariableGroupRow';
import {OptimisationVariableRow} from '../rows/OptimisationVariableRow';
import {RelationItemRow} from '../rows/RelationItemRow';
import {RuleRow} from '../rows/RuleRow';
import {RulesetDefaultRow} from '../rows/RulesetDefaultRow';
import {RulesetHitPolicyRow} from '../rows/RulesetHitPolicyRow';
import {createBoxedEditorService} from '../service/createBoxedEditorService';

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
    view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}});
}

/** Renders a single row component in isolation, wrapped in the providers every row needs. */
function renderRow(
    service: ReturnType<typeof createBoxedEditorService>,
    children: ReactElement,
): ReturnType<typeof render> {
    return render(
        <BoxedEditorProvider
            service={service}
            readOnly={false}
            showDescription={false}
            showTestResults={false}
            showType={false}
            autoRunTests={false}
            languageService={languageService}
        >
            <BoxedEditorUiProvider>{children}</BoxedEditorUiProvider>
        </BoxedEditorProvider>,
    );
}

const DRAG_HANDLE_LABEL = 'Drag to reorder row';

describe('row kinds: list', () => {
    it('renders the header and its items, and edits an item value', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ stages: ["review", "approve"] }');
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        const {container} = render(
            <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
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

        expect(mutable.toPortable().stages).toMatchObject({'@kind': 'expression'});
        expect((mutable.toPortable().stages as {expression: string}).expression).toContain('submitted');
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('appends a blank item via the trailing placeholder without opening a menu', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ stages: ["review", "approve"] }');
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        render(<BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />);

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

    it('appends a type-compatible item to a numeric list', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ scores: [1, 2] }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await user.click(screen.getAllByText('(new item)')[0]);

        expect(service.getBoxedRowsData('scores')).toHaveLength(3);
        expect(service.getBoxedRowData('scores[2]')).toMatchObject({
            kind: 'list-item',
            value: '0',
        });
    });

    it('hides the placeholder under readOnly', () => {
        const mutable = MutableDecisionService.fromCode('{ stages: ["review"] }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" readOnly />);

        expect(screen.queryByText('(new item)')).not.toBeInTheDocument();
    });

    it('duplicates and deletes list items through a whole-parent rewrite', () => {
        const mutable = MutableDecisionService.fromCode('{ stages: ["review", "approve"] }');
        const service = createBoxedEditorService(mutable);
        const listRow = service.getBoxedRowData('stages')!;
        const items = service.getBoxedRowsData('stages');

        const duplicated = [items[0], items[0], items[1]].map((item, index) => ({
            ...item,
            path: `stages[${index}]`,
            name: `Item ${index + 1}`,
        }));
        expect(isPortableError(service.setBoxedRowData('stages', {...listRow, children: duplicated}))).toBe(false);
        expect(service.getBoxedRowsData('stages')).toHaveLength(3);

        const after = service.getBoxedRowsData('stages');
        const deleted = [after[0], after[2]].map((item, index) => ({
            ...item,
            path: `stages[${index}]`,
            name: `Item ${index + 1}`,
        }));
        expect(isPortableError(service.setBoxedRowData('stages', {...listRow, children: deleted}))).toBe(false);
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

        const {container} = render(
            <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
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
        const mutable = MutableDecisionService.fromCode('{ people: [{ name: "Ada" }, { name: "Lin" }] }');
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        render(<BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />);

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

        const withColumn = addRelationColumn({...relation, children}, 'status');
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
        const withoutColumn = removeRelationColumn({...afterAdd, children: childrenAfterAdd}, 'age');
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

        render(<BoxedEditor service={service} path="offices" languageService={languageService} />);

        expect(screen.getByText('address')).toBeInTheDocument();
        expect(screen.getByText("'Vilnius'")).toBeInTheDocument();
        expect(screen.queryByText(/"city"/)).not.toBeInTheDocument();
    });
});

describe('row kinds: computed array', () => {
    it('renders a loop expression as a single field row, never as list items', () => {
        const mutable = MutableDecisionService.fromCode('{ doubled: for x in [1, 2, 3] return x * 2 }');
        const service = createBoxedEditorService(mutable);
        const row = service.getBoxedRowData('doubled')!;

        expect(row.kind).toBe('field');
        expect(row.value).toContain('for');

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        expect(screen.getByText(row.value!)).toBeInTheDocument();
        expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
    });
});

describe('row kinds: function', () => {
    it('renders an inline function with its argument headers and edits the synthesized result', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ func monthly(amount: number): amount / 12 }');
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        const {container} = render(
            <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
        );

        expect(screen.getByText('monthly')).toBeInTheDocument();
        expect(screen.getByText('amount')).toBeInTheDocument();
        expect(screen.getByText('result')).toBeInTheDocument();
        expect(screen.getByText('amount / 12')).toBeInTheDocument();

        await user.click(screen.getByText('amount / 12'));
        await user.click(queryEditable(container));
        replaceDoc(container, 'amount / 24');
        await user.keyboard('{Enter}');

        // An inline function's body is a bare expression in the AST — `monthly.result` names no real
        // field there (it's a UI-only synthesized path), so the edit commits by rewriting the whole
        // `monthly` function instead; it stays collapsed to an inline function afterward.
        expect(mutable.toPortable().monthly).toMatchObject({
            '@kind': 'function',
            '@body': {'@kind': 'expression', expression: 'amount / 24'},
        });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('renders a no-argument function', () => {
        const mutable = MutableDecisionService.fromCode('{ func answer(): 42 }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        expect(screen.getByText('answer')).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders a multi-statement function body as ordinary field rows, not function-result rows', () => {
        const mutable = MutableDecisionService.fromCode(
            '{ func compute(x: number): { doubled: x * 2; total: doubled + 1 } }',
        );
        const service = createBoxedEditorService(mutable);

        expect(service.getBoxedRowsData('compute').map((row) => row.kind)).toEqual(['field', 'field']);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        expect(screen.getByText('doubled')).toBeInTheDocument();
        expect(screen.getByText('x * 2')).toBeInTheDocument();
        expect(screen.getByText('total')).toBeInTheDocument();
    });

    it('renders a function nested inside a context', () => {
        const mutable = MutableDecisionService.fromCode('{ group: { func nested(x: number): x + 1 } }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        expect(screen.getByText('nested')).toBeInTheDocument();
        expect(screen.getByText('x + 1')).toBeInTheDocument();
    });

    it('renders the synthesized result as a non-draggable row', () => {
        const mutable = MutableDecisionService.fromCode('{ func monthly(amount: number): amount / 12 }');
        const service = createBoxedEditorService(mutable);
        const row = service.getBoxedRowData('monthly.result')!;

        renderRow(service, <FunctionResultRow row={row} />);

        expect(screen.getByText('amount / 12')).toBeInTheDocument();
        expect(screen.queryByLabelText(DRAG_HANDLE_LABEL)).not.toBeInTheDocument();
    });
});

describe('row kinds: ruleset', () => {
    const RULESET_CODE = `{
    ruleset risk(age: number, income: number): {
      hitPolicy: "first-match"
      rules: [
        { when: { age: 18..25, income: < 30000 }, then: { level: "high", limit: 1000 } }
        { when: age >= 26 and age <= 64, then: { level: "medium", limit: 5000 } }
      ]
      default: { level: "none", limit: 0 }
    }
  }`;

    it('renders the hit policy, condition/action headers, and both rule condition forms', () => {
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        expect(screen.getByText('risk')).toBeInTheDocument();
        expect(screen.getByText('age')).toBeInTheDocument();
        expect(screen.getByText('income')).toBeInTheDocument();
        expect(screen.getByText('level')).toBeInTheDocument();
        expect(screen.getByText('limit')).toBeInTheDocument();
        expect(screen.getByText('hitPolicy')).toBeInTheDocument();
        expect(screen.getByText('first-match')).toBeInTheDocument();
        // Cell-map form: one cell per condition column.
        expect(screen.getByText('18..25')).toBeInTheDocument();
        expect(screen.getByText('< 30000')).toBeInTheDocument();
        // Boolean-expression form: one spanning cell.
        expect(screen.getByText('age >= 26 and age <= 64')).toBeInTheDocument();
        expect(screen.getByText('otherwise')).toBeInTheDocument();
    });

    it('edits a condition cell blank and omits the key on write ("any")', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        const {container} = render(
            <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
        );

        await user.click(screen.getByText('18..25'));
        await user.click(queryEditable(container));
        replaceDoc(container, '');
        await user.keyboard('{Enter}');

        expect(mutable.get('risk.rules[0]', 'ALL')).toMatchObject({
            when: {income: '< 30000'},
        });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('edits the spanning cell of a boolean-expression rule', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        const {container} = render(
            <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
        );

        await user.click(screen.getByText('age >= 26 and age <= 64'));
        await user.click(queryEditable(container));
        replaceDoc(container, 'age >= 30');
        await user.keyboard('{Enter}');

        expect(mutable.get('risk.rules[1]', 'ALL')).toMatchObject({
            when: {'@kind': 'expression', expression: 'age >= 30'},
        });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('shows and edits priority only under "best-match"', async () => {
        const user = userEvent.setup();
        const BEST_MATCH = `{
      ruleset risk(age: number): {
        hitPolicy: "best-match"
        rules: [
          { when: { age: >= 18 }, then: { level: "high" }, priority: 1 }
        ]
      }
    }`;
        const mutable = MutableDecisionService.fromCode(BEST_MATCH);
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        const {container} = render(
            <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
        );

        expect(screen.getByText('priority')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();

        await user.click(screen.getByText('1'));
        await user.click(queryEditable(container));
        replaceDoc(container, '2');
        await user.keyboard('{Enter}');

        expect(mutable.get('risk.rules[0]', 'ALL')).toMatchObject({priority: 2});
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('hides priority under "first-match"', () => {
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        expect(screen.queryByText('priority')).not.toBeInTheDocument();
    });

    it('omits the default row under "collect-matches"', () => {
        const COLLECT = `{
      ruleset risk(age: number): {
        hitPolicy: "collect-matches"
        rules: [{ when: { age: >= 18 }, then: { level: "high" } }]
      }
    }`;
        const mutable = MutableDecisionService.fromCode(COLLECT);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        expect(screen.queryByText('otherwise')).not.toBeInTheDocument();
        expect(screen.getByText('collect-matches')).toBeInTheDocument();
    });

    it('appends a blank rule before the default row via the trailing placeholder', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        render(<BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />);

        await user.click(screen.getByText('(new rule)'));

        const children = service.getBoxedRowsData('risk');
        expect(children.map((row) => row.kind)).toEqual([
            'ruleset-hit-policy',
            'rule',
            'rule',
            'rule',
            'ruleset-default',
        ]);
        expect(children[3]).toMatchObject({kind: 'rule', name: 'Rule 3'});
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('a rule row is draggable; the default and hit-policy rows are not', () => {
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);
        const rule = service.getBoxedRowData('risk.rules[0]') as BoxedTableRowData;
        const fallback = service.getBoxedRowData('risk.default') as BoxedTableRowData;
        const hitPolicy = service.getBoxedRowData('risk.hitPolicy')!;

        const rule1 = renderRow(service, <RuleRow row={rule} />);
        expect(screen.getByLabelText(DRAG_HANDLE_LABEL)).toBeInTheDocument();
        rule1.unmount();

        const default1 = renderRow(service, <RulesetDefaultRow row={fallback} />);
        expect(screen.queryByLabelText(DRAG_HANDLE_LABEL)).not.toBeInTheDocument();
        default1.unmount();

        renderRow(service, <RulesetHitPolicyRow row={hitPolicy} />);
        expect(screen.queryByLabelText(DRAG_HANDLE_LABEL)).not.toBeInTheDocument();
    });
});

describe('row kinds: optimisation', () => {
    const OPTIMISE_CODE = `{
    optimise factory(workers: number): {
      using: "highs"
      bottlenecks: true
      variables: {
        chairs: <number, integer: true, min: 0>
      }
      maximise: 15 * chairs
      constraints: { capacity: chairs <= workers }
      timeLimit: 1000
    }
  }`;

    it('renders the whole family in the order the service returns, honouring the fixed shape', () => {
        const mutable = MutableDecisionService.fromCode(OPTIMISE_CODE);
        const service = createBoxedEditorService(mutable);

        // Matches `normalize.ts`'s `normalizeOptimisation` exactly (rendered as returned, never
        // re-sorted): `using`/`bottlenecks`/`timeLimit` all come from the same settings loop, ahead
        // of the variables/objective/constraints blocks.
        expect(service.getBoxedRowsData('factory').map((row) => row.kind)).toEqual([
            'optimisation-setting',
            'optimisation-setting',
            'optimisation-setting',
            'optimisation-variable-group',
            'optimisation-objective',
            'optimisation-constraint-group',
        ]);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        expect(screen.getByText('factory')).toBeInTheDocument();
        expect(screen.getByText('workers')).toBeInTheDocument();
        expect(screen.getByText('using')).toBeInTheDocument();
        expect(screen.getByText('highs')).toBeInTheDocument();
        expect(screen.getByText('bottlenecks')).toBeInTheDocument();
        expect(screen.getByText('true')).toBeInTheDocument();
        expect(screen.getByText('variables')).toBeInTheDocument();
        expect(screen.getByText('chairs')).toBeInTheDocument();
        expect(screen.getByText('maximise')).toBeInTheDocument();
        expect(screen.getByText('15 * chairs')).toBeInTheDocument();
        expect(screen.getByText('constraints')).toBeInTheDocument();
        expect(screen.getByText('capacity')).toBeInTheDocument();
        expect(screen.getByText('chairs <= workers')).toBeInTheDocument();
        expect(screen.getByText('timeLimit')).toBeInTheDocument();
        expect(screen.getByText('1000')).toBeInTheDocument();
    });

    it('appends a blank constraint via the group placeholder', async () => {
        // A new constraint doesn't need to reference every declared variable, so it links cleanly.
        // (A *variable* the objective/constraints never reference is rejected by the engine at write
        // time — E339, "declares variable ... but never uses it" — so appending one isn't exercised
        // as a full commit here; Phase 5's "Add Variable" wiring is expected to seed a usage too.)
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(OPTIMISE_CODE);
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        render(<BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />);

        await user.click(screen.getByText('(new constraint)'));

        expect(mutable.get('factory', 'ALL')).toMatchObject({
            '@constraints': {capacity: 'chairs <= workers', constraint: '0 <= 0'},
        });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('the appendOptimisationVariable helper aligns the new row with the group', () => {
        const mutable = MutableDecisionService.fromCode(OPTIMISE_CODE);
        const service = createBoxedEditorService(mutable);
        const group = service.getBoxedRowsData('factory').find((row) => row.kind === 'optimisation-variable-group')!;

        const appended = appendOptimisationVariable(group);

        expect(appended.children).toHaveLength(2);
        expect(appended.children?.[1]).toMatchObject({
            kind: 'optimisation-variable',
            name: 'variable',
            path: 'factory.variables.variable',
            value: '<number, min: 0>',
        });
    });

    it('edits timeLimit and round-trips the numeric literal', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(OPTIMISE_CODE);
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        const {container} = render(
            <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
        );

        await user.click(screen.getByText('1000'));
        await user.click(queryEditable(container));
        replaceDoc(container, '2000');
        await user.keyboard('{Enter}');

        expect(mutable.get('factory', 'ALL')).toMatchObject({'@timeLimit': 2000});
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('keeps the expression unchanged when switching maximise to minimise', () => {
        const mutable = MutableDecisionService.fromCode(OPTIMISE_CODE);
        const service = createBoxedEditorService(mutable);
        const objective = service.getBoxedRowData('factory.maximise')!;

        expect(isPortableError(service.setBoxedRowData('factory.maximise', {...objective, name: 'minimise'}))).toBe(
            false,
        );

        expect(mutable.get('factory', 'ALL')).toMatchObject({
            '@minimise': '15 * chairs',
        });
        expect(mutable.get('factory', 'ALL')).not.toHaveProperty('@maximise');
    });

    it('variable and constraint rows are draggable; groups, objective, and settings are not', () => {
        const mutable = MutableDecisionService.fromCode(OPTIMISE_CODE);
        const service = createBoxedEditorService(mutable);
        const children = service.getBoxedRowsData('factory');
        const usingRow = children.find((row) => row.name === 'using')!;
        const variableGroup = children.find((row) => row.kind === 'optimisation-variable-group')!;
        const variable = variableGroup.children![0];
        const objective = children.find((row) => row.kind === 'optimisation-objective')!;
        const constraintGroup = children.find((row) => row.kind === 'optimisation-constraint-group')!;
        const constraint = constraintGroup.children![0];

        const draggable: [string, BoxedRowData][] = [
            ['variable', variable],
            ['constraint', constraint],
        ];
        for (const [, row] of draggable) {
            const rendered = renderRow(
                service,
                row.kind === 'optimisation-variable' ? (
                    <OptimisationVariableRow row={row} />
                ) : (
                    <OptimisationConstraintRow row={row} />
                ),
            );
            expect(screen.getByLabelText(DRAG_HANDLE_LABEL)).toBeInTheDocument();
            rendered.unmount();
        }

        const fixed = renderRow(service, <OptimisationSettingRow row={usingRow} />);
        expect(screen.queryByLabelText(DRAG_HANDLE_LABEL)).not.toBeInTheDocument();
        fixed.unmount();

        const fixedGroup = renderRow(service, <OptimisationVariableGroupRow row={{...variableGroup, children: []}} />);
        expect(screen.queryByLabelText(DRAG_HANDLE_LABEL)).not.toBeInTheDocument();
        fixedGroup.unmount();

        const fixedConstraintGroup = renderRow(
            service,
            <OptimisationConstraintGroupRow row={{...constraintGroup, children: []}} />,
        );
        expect(screen.queryByLabelText(DRAG_HANDLE_LABEL)).not.toBeInTheDocument();
        fixedConstraintGroup.unmount();

        const fixedObjective = renderRow(service, <OptimisationObjectiveRow row={objective} />);
        expect(screen.queryByLabelText(DRAG_HANDLE_LABEL)).not.toBeInTheDocument();
        fixedObjective.unmount();
    });
});
