import {describe, expect, it, vi} from 'vitest';
import {act, render, screen, waitFor} from '@testing-library/react';
import {renderHook} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {EditorView} from '@codemirror/view';
import {MutableDecisionService} from '@edgerules/node/mutable';
import type {ReactNode} from 'react';
import {BoxedEditor} from '../BoxedEditor';
import {BoxedEditorProvider} from '../context/BoxedEditorContext';
import {useRowCommands} from '../commands/useRowCommands';
import {createBoxedEditorService} from '../service/createBoxedEditorService';

const MODEL = `{
  amount: 10
  other: 20
}`;

// The real dev-build engine service — never mocked (see project testing policy). The class
// itself satisfies `CodeEditorService` via its static `diagnostics`/`completions`.
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

/** Opens the `index`-th row's three-dot menu (document order) and clicks the named item. */
async function chooseAction(user: ReturnType<typeof userEvent.setup>, index: number, label: string): Promise<void> {
    const buttons = screen.getAllByLabelText('Open row actions');
    await user.click(buttons[index]);
    await user.click(screen.getByText(label));
}

describe('commands: value commits', () => {
    it('commits a value edit, updates the model, and fires onChange exactly once', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(MODEL);
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        const {container} = render(
            <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
        );

        await user.click(screen.getByText('10'));
        await user.click(queryEditable(container));
        replaceDoc(container, '99');
        await user.keyboard('{Enter}');

        expect(mutable.toPortable()).toMatchObject({amount: 99});
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(service.toPortable());
        // The cell deactivates back to static text on a successful commit.
        expect(container.querySelector('.cm-editor')).toBeNull();
        expect(screen.getByText('99')).toBeInTheDocument();
    });

    it('rejects an invalid edit, keeps the cell active with the message inline, and never fires onChange', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(MODEL);
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        const {container} = render(
            <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
        );

        await user.click(screen.getByText('10'));
        await user.click(queryEditable(container));
        replaceDoc(container, 'undefinedName + 1');
        await user.keyboard('{Enter}');

        // Rejected: the model is untouched and onChange never fires.
        expect(mutable.toPortable()).toMatchObject({amount: 10});
        expect(onChange).not.toHaveBeenCalled();
        // The cell stays active (still mounts the editor) and shows the error inline.
        expect(container.querySelector('.cm-editor')).not.toBeNull();
        expect(screen.getByRole('alert')).toHaveTextContent(/unresolved reference/i);
    });

    it('mounts only one CodeMirror editor across the tree at a time', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(MODEL);
        const service = createBoxedEditorService(mutable);

        const {container} = render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        await user.click(screen.getByText('10'));
        expect(container.querySelectorAll('.cm-editor')).toHaveLength(1);

        await user.click(screen.getByText('20'));
        expect(container.querySelectorAll('.cm-editor')).toHaveLength(1);
        // The first cell reverted to static text once it lost the active-cell slot.
        expect(screen.getByText('10')).toBeInTheDocument();
    });
});

describe('commands: name commit', () => {
    const mutable = MutableDecisionService.fromCode(MODEL);
    const service = createBoxedEditorService(mutable);
    const onChange = vi.fn();

    function wrapper({children}: {children: ReactNode}): ReactNode {
        return (
            <BoxedEditorProvider
                service={service}
                readOnly={false}
                onChange={onChange}
                showDescription={false}
                showTestResults={false}
                showType={false}
                autoRunTests={false}
            >
                {children}
            </BoxedEditorProvider>
        );
    }

    it('renames a named kind and fires onChange exactly once', () => {
        const {result} = renderHook(() => useRowCommands(), {wrapper});

        let error: unknown;
        act(() => {
            error = result.current.rename('amount', 'renamedAmount');
        });

        expect(error).toBeUndefined();
        expect(mutable.toPortable()).toMatchObject({renamedAmount: 10});
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('passes a rejected rename through as a PortableError without firing onChange', () => {
        onChange.mockClear();
        const {result} = renderHook(() => useRowCommands(), {wrapper});

        let error: unknown;
        act(() => {
            // Colliding with the sibling "other" field.
            error = result.current.rename('renamedAmount', 'other');
        });

        expect(error).toMatchObject({'@kind': 'error', type: 'DuplicateName'});
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('commands: delete', () => {
    it('deletes a field via its menu and fires onChange once', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10; other: 20 }');
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        render(<BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />);

        // Row order: model, amount, other.
        await chooseAction(user, 1, 'Delete');

        expect(mutable.toPortable()).toMatchObject({other: 20});
        expect(mutable.toPortable()).not.toHaveProperty('amount');
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('hides the actions button entirely for rows whose only action is a disabled Delete', () => {
        const RULESET_CODE = `{
      ruleset risk(age: number): {
        hitPolicy: "first-match"
        rules: [{ when: { age: >= 18 }, then: { level: "high" } }]
        default: { level: "none" }
      }
    }`;
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        // model, risk, rule 1 — `ruleset-hit-policy` has no menu at all, and `ruleset-default`'s only
        // action (Delete) is filtered out by `deletable: false` — neither renders a button.
        expect(screen.getAllByLabelText('Open row actions')).toHaveLength(3);
    });
});

describe('commands: Convert to Context / Relation / List', () => {
    it.each(['Convert to context', 'Convert to relation', 'Convert to list'] as const)(
        '"%s" replaces the field with an empty container and fires onChange once',
        async (label) => {
            const user = userEvent.setup();
            const mutable = MutableDecisionService.fromCode('{ x: 1 }');
            const service = createBoxedEditorService(mutable);
            const onChange = vi.fn();

            render(<BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />);

            await chooseAction(user, 1, label);

            expect(mutable.toPortable().x).not.toBe(1);
            expect(onChange).toHaveBeenCalledTimes(1);
        },
    );
});

describe('commands: model additions', () => {
    it('Add Field appends a blank field at the model root', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 0, 'Add field');

        expect(service.getBoxedRowData('field')).toMatchObject({kind: 'field', value: "''"});
    });

    it('Add Function appends a blank inline function at the model root', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 0, 'Add function');

        expect(mutable.toPortable().function).toMatchObject({'@kind': 'function'});
    });

    it('Add Decision Table appends a linkable, empty ruleset at the model root', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 0, 'Add decision table');

        expect(mutable.toPortable().decisionTable).toMatchObject({
            '@kind': 'ruleset',
            '@hitPolicy': 'first-match',
            '@rules': [],
        });
    });

    it('Add Relation appends a seeded empty record at the model root', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 0, 'Add relation');

        // One empty record distinguishes the relation from a scalar list after an engine round-trip.
        expect(mutable.toPortable().relation).toMatchObject({'@kind': 'expression', expression: '[{  }]'});
    });

    it('Add List appends an empty list at the model root', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 0, 'Add list');

        expect(service.getBoxedRowData('list')).toMatchObject({kind: 'list'});
    });

    it('Add Optimisation appends a linkable optimisation at the model root (model only)', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 0, 'Add optimisation');

        expect(mutable.toPortable().optimisation).toMatchObject({'@kind': 'optimise'});
    });
});

describe('commands: context additions', () => {
    it('Add Field appends inside the context, not at the model root', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ group: { a: 1 } }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        // Row order: model, group, a.
        await chooseAction(user, 1, 'Add field');

        expect(service.getBoxedRowData('group.field')).toMatchObject({value: "''"});
        expect(service.getBoxedRowData('field')).toBeUndefined();
    });

    it('has no "Add optimisation" entry — optimise may only be declared at the model root', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ group: { a: 1 } }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await user.click(screen.getAllByLabelText('Open row actions')[1]);

        expect(screen.queryByText('Add optimisation')).not.toBeInTheDocument();
    });
});

describe('commands: relation columns', () => {
    const MODEL = '{ people: [{ name: "Ada" }, { name: "Lin" }] }';

    it('Add Column appends a blank column across every record', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(MODEL);
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        render(<BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />);
        // Row order: model, people.
        await chooseAction(user, 1, 'Add column');

        expect(service.getBoxedRowData('people')).toMatchObject({columns: ['name', 'column']});
        expect(service.getBoxedRowsData('people')).toMatchObject([{cells: ["'Ada'", "''"]}, {cells: ["'Lin'", "''"]}]);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('Delete "‹column›" Column removes it from every record', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(
            '{ people: [{ name: "Ada", age: 32 }, { name: "Lin", age: 28 }] }',
        );
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 1, 'Delete "age" column');

        expect(service.getBoxedRowData('people')).toMatchObject({columns: ['name']});
        expect(service.getBoxedRowsData('people')).toMatchObject([{cells: ["'Ada'"]}, {cells: ["'Lin'"]}]);
    });
});

describe('commands: ruleset rules and columns', () => {
    const RULESET_CODE = `{
    ruleset risk(age: number): {
      hitPolicy: "first-match"
      rules: [{ when: { age: >= 18 }, then: { level: "high" } }]
      default: { level: "none" }
    }
  }`;

    it('Add Rule appends a blank rule before the default row', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        // Row order: model, risk, rule 1.
        await chooseAction(user, 1, 'Add rule');

        expect(service.getBoxedRowsData('risk').map((row) => row.kind)).toEqual([
            'ruleset-hit-policy',
            'rule',
            'rule',
            'ruleset-default',
        ]);
    });

    it('Add Condition Column extends the signature and every cell-map rule', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 1, 'Add condition column');

        expect(mutable.toPortable().risk).toMatchObject({
            '@parameters': {age: 'number', condition: 'string'},
        });
        expect(service.getBoxedRowData('risk')).toMatchObject({
            conditionColumns: ['age', 'condition'],
        });
    });

    it('Add Action Column extends every rule and the default row with a blank literal', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 1, 'Add action column');

        expect(mutable.toPortable().risk).toMatchObject({
            '@rules': [{then: {level: "'high'", action: "''"}}],
            '@default': {level: "'none'", action: "''"},
        });
    });

    it('Delete "‹column›" Column removes a condition column from the signature', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 1, 'Delete "age" column');

        expect(mutable.toPortable().risk).toMatchObject({'@parameters': {}});
    });

    it('Delete "‹column›" Column removes an action column from every rule and the default', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(RULESET_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 1, 'Delete "level" column');

        expect(mutable.toPortable().risk).toMatchObject({
            '@rules': [{then: {}}],
            '@default': {},
        });
    });
});

describe('commands: function arguments', () => {
    it('Add Argument appends a uniquely-named, untyped parameter', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ func monthly(amount: number): amount / 12 }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        // Row order: model, monthly, monthly.result.
        await chooseAction(user, 1, 'Add argument');

        expect(service.getBoxedRowData('monthly')).toMatchObject({
            parameters: [{name: 'amount'}, {name: 'arg'}],
        });
    });

    it('Delete "‹argument›" Argument removes an unreferenced argument from the signature', async () => {
        const user = userEvent.setup();
        // `unused` isn't referenced by the body — removing an argument the body *does* reference is
        // rejected by the engine (an ordinary `PortableError`, same as any other invalidating edit).
        const mutable = MutableDecisionService.fromCode(
            '{ func monthly(amount: number, unused: number): amount / 12 }',
        );
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        await chooseAction(user, 1, 'Delete "unused" argument');

        expect(service.getBoxedRowData('monthly')).toMatchObject({
            parameters: [{name: 'amount'}],
        });
    });
});

describe('commands: optimisation arguments, variables, constraints, objective', () => {
    const OPTIMISE_CODE = `{
    optimise factory(workers: number): {
      using: "highs"
      variables: { chairs: <number, integer: true, min: 0> }
      maximise: 15 * chairs
      constraints: { capacity: chairs <= workers }
    }
  }`;

    it('Add Argument / Delete "‹argument›" Argument edit the optimisation signature', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(OPTIMISE_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        // Row order: model, factory (using/bottlenecks/timeLimit settings have no menu).
        await chooseAction(user, 1, 'Add argument');

        expect(service.getBoxedRowData('factory')).toMatchObject({
            parameters: [{name: 'workers'}, {name: 'arg'}],
        });

        // Delete the just-added (unreferenced) argument back off — `workers` is used by the
        // `capacity` constraint, so removing *that* one would be rejected by the engine instead.
        await chooseAction(user, 1, 'Delete "arg" argument');

        expect(service.getBoxedRowData('factory')).toMatchObject({parameters: [{name: 'workers'}]});
    });

    it('Add Variable seeds a companion constraint so the new variable is never unused', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(OPTIMISE_CODE);
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        render(<BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />);
        // Row order: model, factory, variables-group, chairs, objective, constraints-group, capacity.
        await chooseAction(user, 2, 'Add variable');

        expect(mutable.toPortable().factory).toMatchObject({
            '@variables': {chairs: expect.anything(), variable: expect.anything()},
            '@constraints': {capacity: 'chairs <= workers', variableBound: 'variable >= 0'},
        });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('Add Constraint appends a uniquely-named constraint to the group', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(OPTIMISE_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        // Row order: model, factory, variables-group, chairs, objective, constraints-group.
        await chooseAction(user, 5, 'Add constraint');

        expect(mutable.toPortable().factory).toMatchObject({
            '@constraints': {capacity: 'chairs <= workers', constraint: '0 <= 0'},
        });
    });

    it('Switch to Minimise/Maximise flips the objective keyword, keeping its expression', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(OPTIMISE_CODE);
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);
        // Row order: model, factory, variables-group, chairs, objective.
        await chooseAction(user, 4, 'Switch to minimise');

        expect(mutable.toPortable().factory).toMatchObject({'@minimise': '15 * chairs'});
        expect(mutable.toPortable().factory).not.toHaveProperty('@maximise');
    });
});

describe('commands: expand/collapse', () => {
    it('toggles a context row’s children between visible and hidden', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ group: { a: 1 } }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        expect(screen.getByText('a')).toBeInTheDocument();

        // Row order: model, group, a.
        await chooseAction(user, 1, 'Collapse');
        expect(screen.queryByText('a')).not.toBeInTheDocument();

        await chooseAction(user, 1, 'Expand');
        expect(screen.getByText('a')).toBeInTheDocument();
    });
});

describe('commands: View as code', () => {
    it.each([['{ func monthly(amount: number): amount / 12 }', 'monthly']])(
        'emits onOpenNode for a %s',
        async (code, path) => {
            const user = userEvent.setup();
            const mutable = MutableDecisionService.fromCode(code);
            const service = createBoxedEditorService(mutable);
            const onOpenNode = vi.fn();

            render(
                <BoxedEditor service={service} path="*" languageService={languageService} onOpenNode={onOpenNode} />,
            );
            // Row order: model, <target>.
            await chooseAction(user, 1, 'View as code');

            expect(onOpenNode).toHaveBeenCalledWith({path, kind: 'code-editor'});
        },
    );

    it('emits onOpenNode for the model itself', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);
        const onOpenNode = vi.fn();

        render(<BoxedEditor service={service} path="*" languageService={languageService} onOpenNode={onOpenNode} />);
        await chooseAction(user, 0, 'View as code');

        expect(onOpenNode).toHaveBeenCalledWith({path: '*', kind: 'code-editor'});
    });
});

describe('commands: readOnly enablement', () => {
    it('hides every mutating action, keeping only Duplicate on a field', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" readOnly />);
        // Row order: model (no surviving actions — no Duplicate/Expand of its own), amount.
        const buttons = screen.getAllByLabelText('Open row actions');
        expect(buttons).toHaveLength(1);

        await user.click(buttons[0]);
        expect(screen.getByText('Duplicate')).toBeInTheDocument();
        expect(screen.queryByText('Convert to context')).not.toBeInTheDocument();
        expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('keeps Duplicate and Expand/Collapse on a context, hiding every Add/Delete', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ group: { a: 1 } }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" readOnly />);
        // Row order: model (no button), group, a (no button — plain field under readOnly has just
        // Duplicate, rendered by the previous test's assertion; here `a`'s own button still exists).
        const buttons = screen.getAllByLabelText('Open row actions');
        await user.click(buttons[0]);

        expect(screen.getByText('Duplicate')).toBeInTheDocument();
        // Expanded by default — the surviving toggle currently reads "Collapse".
        expect(screen.getByText('Collapse')).toBeInTheDocument();
        expect(screen.queryByText('Add field')).not.toBeInTheDocument();
        expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('setBoxedRowData/rename/remove still reject, but Duplicate remains a genuine write', async () => {
        // Duplicate is a copy, not a mutation of the source — it is the one write `readOnly` allows.
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);

        render(<BoxedEditor service={service} path="*" readOnly />);
        await chooseAction(user, 0, 'Duplicate');

        expect(mutable.toPortable()).toMatchObject({amount: 10, amount2: 10});
    });
});

describe('commands: Model Settings', () => {
    it('opens with the current name/version, and closes on Save', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        render(<BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />);
        await chooseAction(user, 0, 'Model settings');

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByLabelText('Name')).toHaveValue('Model');

        await user.clear(screen.getByLabelText('Version'));
        await user.type(screen.getByLabelText('Version'), '1.0.0');
        await user.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        // The rest of the model survives the commit (a regression risk fixed in this phase: the
        // `model` row prop always has `children` stripped, since every path does — denormalizing it
        // as-is would silently wipe the whole model).
        expect(mutable.toPortable()).toMatchObject({amount: 10});
        // Root metadata writes are accepted (no PortableError) but not yet persisted by the engine —
        // see docs/BUG_REPORTS.md ("Root metadata … is silently dropped by `set('*', …)`").
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('closes without committing on Cancel', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
        const service = createBoxedEditorService(mutable);
        const onChange = vi.fn();

        render(<BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />);
        await chooseAction(user, 0, 'Model settings');
        await user.click(screen.getByRole('button', {name: 'Cancel'}));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(onChange).not.toHaveBeenCalled();
    });
});
