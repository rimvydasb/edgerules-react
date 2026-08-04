import {describe, expect, it, vi} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {DecisionTableEditor} from '../DecisionTableEditor';
import {BEST_MATCH_MODEL_DSL, RISK_MODEL_DSL, SCORECARD_MODEL_DSL} from '../testing/model.dsl';

// The real dev-build engine service — never mocked (see project testing policy).
const languageService = MutableDecisionService;

function renderRisk(extraProps: Partial<Parameters<typeof DecisionTableEditor>[0]> = {}) {
    const service = MutableDecisionService.fromCode(RISK_MODEL_DSL);
    const utils = render(
        <DecisionTableEditor service={service} path="risk" languageService={languageService} {...extraProps} />,
    );
    return {service, ...utils};
}

function queryCmContent(container: HTMLElement): HTMLElement {
    const editable = container.querySelector('.cm-content[contenteditable="true"]');
    if (!editable) {
        throw new Error('Expected an active CodeEditorCell');
    }
    return editable as HTMLElement;
}

/** Finds a display cell by its full text — highlighted cells split text across token spans. */
function cellByText(scope: HTMLElement, text: string): HTMLElement {
    const cell = Array.from(scope.querySelectorAll('[role="button"]')).find((element) => element.textContent === text);
    if (!cell) {
        throw new Error(`No display cell with text ${JSON.stringify(text)}`);
    }
    return cell as HTMLElement;
}

describe('DecisionTableEditor rendering', () => {
    it('renders input and output columns with type labels', () => {
        renderRisk();
        const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
        expect(headers.join(' ')).toContain('age');
        expect(headers.join(' ')).toContain('income');
        expect(headers.join(' ')).toContain('segment');
        expect(headers.join(' ')).toContain('level');
        expect(headers.join(' ')).toContain('limit');
        expect(headers.join(' ')).toContain('annotation');
    });

    it('re-sugars unary tests for display and shows – for any', () => {
        const {container} = renderRisk();
        expect(container.textContent).toContain('18..25');
        expect(container.textContent).toContain('< 30000');
        expect(container.textContent).toContain('"retail"');
        // Row 2 omits the segment column → rendered as the matches-all dash.
        expect(container.textContent).toContain('–');
    });

    it('renders a boolean-expression when as a row-spanning cell', () => {
        const {container} = renderRisk();
        expect(container.textContent).toContain('age >= 65 or segment = "premium"');
        const spanning = container.querySelector('td[colspan="3"]');
        expect(spanning).not.toBeNull();
    });

    it('renders the pinned default row', () => {
        const {container} = renderRisk();
        expect(container.textContent).toContain('default');
        expect(container.textContent).toContain("'none'");
    });

    it('shows the hit policy and statically highlighted cells without mounting CodeMirror', () => {
        const {container} = renderRisk();
        expect(screen.getByLabelText('Hit policy')).toBeDefined();
        expect(container.querySelector('.tok-number')).not.toBeNull();
        expect(container.querySelector('.cm-editor')).toBeNull();
    });

    it('detects a scorecard: one score column and a scorecard badge', () => {
        const service = MutableDecisionService.fromCode(SCORECARD_MODEL_DSL);
        const {container} = render(
            <DecisionTableEditor service={service} path="scoreFactors" languageService={languageService} />,
        );
        expect(container.textContent).toContain('scorecard');
        const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
        expect(headers.some((text) => text.includes('score'))).toBe(true);
    });

    it('shows a priority column for best-match', () => {
        const service = MutableDecisionService.fromCode(BEST_MATCH_MODEL_DSL);
        const {container} = render(
            <DecisionTableEditor service={service} path="tier" languageService={languageService} />,
        );
        const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
        expect(headers.some((text) => text.includes('priority'))).toBe(true);
        expect(container.textContent).toContain('1');
        expect(container.textContent).toContain('2');
    });

    it('renders an error for a path that is not a ruleset', () => {
        const service = MutableDecisionService.fromCode(RISK_MODEL_DSL);
        render(<DecisionTableEditor service={service} path="nonexistent" />);
        expect(screen.getByRole('alert').textContent).toContain('nonexistent');
    });

    it('hides editing affordances when readOnly', () => {
        renderRisk({readOnly: true});
        expect(screen.queryByRole('button', {name: /add rule/i})).toBeNull();
        expect(screen.queryByLabelText('rule 1 menu')).toBeNull();
    });
});

describe('DecisionTableEditor editing', () => {
    it('edits an output cell through the engine and fires onChange', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const {service, container} = renderRisk({onChange});

        const limitCell = cellByText(container.querySelectorAll('tbody tr')[0] as HTMLElement, '1000');
        await user.dblClick(limitCell);

        const editable = queryCmContent(container);
        await user.click(editable);
        await user.keyboard('{Control>}a{/Control}1500{Enter}');

        await waitFor(async () => {
            await expect(service.execute('decision')).resolves.toEqual({
                level: 'high',
                limit: 1500,
            });
        });
        expect(onChange).toHaveBeenCalled();
        // Editor unmounts after commit; the display shows the new value.
        expect(container.querySelector('.cm-editor')).toBeNull();
        expect(container.textContent).toContain('1500');
    });

    it('edits a when cell with unary-test sugar', async () => {
        const user = userEvent.setup();
        const {service, container} = renderRisk();

        const firstRow = container.querySelectorAll('tbody tr')[0] as HTMLElement;
        await user.dblClick(cellByText(firstRow, '18..25'));

        const editable = queryCmContent(container);
        await user.click(editable);
        await user.keyboard('{Control>}a{/Control}21..30{Enter}');

        await waitFor(() => {
            expect(container.textContent).toContain('21..30');
        });
        await expect(service.execute('decision')).resolves.toEqual({
            level: 'high',
            limit: 1000,
        });
    });

    it('clearing a when cell means matches-any', async () => {
        const user = userEvent.setup();
        const {service, container} = renderRisk();

        const firstRow = container.querySelectorAll('tbody tr')[0] as HTMLElement;
        await user.dblClick(cellByText(firstRow, '< 30000'));
        const editable = queryCmContent(container);
        await user.click(editable);
        await user.keyboard('{Control>}a{/Control}{Backspace}{Enter}');

        await waitFor(() => {
            expect(container.querySelector('.cm-editor')).toBeNull();
        });
        const definition = service.get('risk.*') as {
            '@rules': Array<{when?: Record<string, string>}>;
        };
        expect(definition['@rules'][0].when).not.toHaveProperty('income');
    });

    it('restores the model and surfaces the engine error when an edit is rejected', async () => {
        const user = userEvent.setup();
        const {service, container} = renderRisk();

        const firstRow = container.querySelectorAll('tbody tr')[0] as HTMLElement;
        await user.dblClick(cellByText(firstRow, '18..25'));
        const editable = queryCmContent(container);
        await user.click(editable);
        await user.keyboard('{Control>}a{/Control}"not a number test"{Enter}');

        await waitFor(() => {
            expect(screen.getByRole('alert')).toBeDefined();
        });
        // The failed edit must not poison the model (docs/BUG_REPORTS.md #2).
        await expect(service.execute('decision')).resolves.toEqual({
            level: 'high',
            limit: 1000,
        });
        // The editor stays open with the attempted text and an inline diagnostic instead of
        // silently reverting and discarding what the user typed (DT-029).
        expect(container.querySelector('.cm-editor')).not.toBeNull();
        expect(container.textContent).toContain('not a number test');
        expect(container.textContent).toContain('linker error');

        // Escape cancels and reverts the display back to the last good value. The lint tooltip
        // showing the diagnostic consumes the first Escape (closing itself); the second reaches
        // the cell's own cancel binding.
        await user.keyboard('{Escape}{Escape}');
        await waitFor(() => {
            expect(container.querySelector('.cm-editor')).toBeNull();
        });
        const revertedRow = container.querySelectorAll('tbody tr')[0] as HTMLElement;
        expect(cellByText(revertedRow, '18..25')).toBeDefined();
    });

    it('adds and deletes a rule row', async () => {
        const user = userEvent.setup();
        const {service, container} = renderRisk();

        await user.click(screen.getByRole('button', {name: /add rule/i}));
        await waitFor(() => {
            expect((service.get('risk.*') as {'@rules': unknown[]})['@rules']).toHaveLength(4);
        });

        await user.click(screen.getByLabelText('rule 4 menu'));
        await user.click(screen.getByRole('menuitem', {name: /delete rule/i}));
        // Destructive deletes require confirmation (DT-008).
        await user.click(screen.getByRole('button', {name: /delete rule/i}));
        await waitFor(() => {
            expect((service.get('risk.*') as {'@rules': unknown[]})['@rules']).toHaveLength(3);
        });
        expect(container.querySelectorAll('tbody tr')).toHaveLength(3 + 1 + 1); // rules + default + add-rule
        // An undo affordance follows a destructive structural edit.
        expect(screen.getByText(/rule 4 deleted/i)).toBeDefined();
    });

    it('reorders rules with move down', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('rule 1 menu'));
        await user.click(screen.getByRole('menuitem', {name: /move down/i}));

        await waitFor(() => {
            const definition = service.get('risk.*') as {
                '@rules': Array<{then: Record<string, unknown>}>;
            };
            expect(definition['@rules'][0].then.level).toBe("'medium'");
        });
    });

    it('changes the hit policy to best-match and gains a priority column', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('Hit policy'));
        await user.click(screen.getByRole('option', {name: /best match/i}));

        await waitFor(() => {
            expect((service.get('risk.*') as {'@hitPolicy': string})['@hitPolicy']).toBe('best-match');
        });
        const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
        expect(headers.some((text) => text.includes('priority'))).toBe(true);
    });

    it('edits the default row through the engine', async () => {
        const user = userEvent.setup();
        const {service, container} = renderRisk();

        const rows = container.querySelectorAll('tbody tr');
        const defaultRow = rows[rows.length - 2] as HTMLElement; // last data row before add-rule
        await user.dblClick(cellByText(defaultRow, '0'));
        const editable = queryCmContent(container);
        await user.click(editable);
        await user.keyboard('{Control>}a{/Control}99{Enter}');

        await waitFor(() => {
            const definition = service.get('risk.*') as {
                '@default': Record<string, unknown>;
            };
            expect(definition['@default'].limit).toBe(99);
        });
    });

    it('edits the annotation (rule name)', async () => {
        const user = userEvent.setup();
        const {service, container} = renderRisk();

        const firstRow = container.querySelectorAll('tbody tr')[0] as HTMLElement;
        const cells = firstRow.querySelectorAll('td');
        const annotationCell = cells[cells.length - 2] as HTMLElement; // before the row-menu cell
        await user.dblClick(annotationCell.querySelector('[role="button"]') as HTMLElement);
        await user.keyboard('young low income{Enter}');

        await waitFor(() => {
            const definition = service.get('risk.*') as {
                '@rules': Array<{name?: string}>;
            };
            expect(definition['@rules'][0].name).toBe('young low income');
        });
    });

    it('adds an input column via the table menu without breaking the existing call site', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('table menu'));
        await user.click(screen.getByRole('menuitem', {name: /add input column/i}));
        await user.type(screen.getByLabelText('Parameter name'), 'channel');
        await user.click(screen.getByRole('button', {name: 'OK'}));

        await waitFor(() => {
            const definition = service.get('risk.*') as {
                '@parameters': Record<string, unknown>;
            };
            expect(definition['@parameters']).toHaveProperty('channel');
        });
        // The `decision` call site still only passes age/income/segment — the new
        // defaulted parameter must not break it.
        await expect(service.execute('decision')).resolves.toEqual({
            level: 'high',
            limit: 1000,
        });
    });

    it('adds an output column via the table menu', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('table menu'));
        await user.click(screen.getByRole('menuitem', {name: /add output column/i}));
        await user.type(screen.getByLabelText('Output field name'), 'reason');
        await user.click(screen.getByRole('button', {name: 'OK'}));

        await waitFor(() => {
            const definition = service.get('risk.*') as {
                '@rules': Array<{then: Record<string, unknown>}>;
            };
            expect(definition['@rules'][0].then).toHaveProperty('reason');
        });
    });

    it('edits a scorecard score cell', async () => {
        const user = userEvent.setup();
        const service = MutableDecisionService.fromCode(SCORECARD_MODEL_DSL);
        const {container} = render(
            <DecisionTableEditor service={service} path="scoreFactors" languageService={languageService} />,
        );

        const secondRow = container.querySelectorAll('tbody tr')[1] as HTMLElement;
        await user.dblClick(cellByText(secondRow, '10'));
        const editable = queryCmContent(container);
        await user.click(editable);
        await user.keyboard('{Control>}a{/Control}12{Enter}');

        await waitFor(async () => {
            await expect(service.execute('total')).resolves.toBe(32);
        });
    });
});

describe('DecisionTableEditor bug fixes (docs/boxed-editor/bugs-in-decision-table.md)', () => {
    it('DT-001: converting cells to an expression preserves semantics instead of clearing to true', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('rule 1 menu'));
        await user.click(screen.getByRole('menuitem', {name: /use expression condition/i}));

        await waitFor(() => {
            const definition = service.get('risk.*') as {'@rules': Array<{when?: unknown}>};
            expect(definition['@rules'][0].when).not.toBe('true');
            expect(typeof (definition['@rules'][0].when as {expression?: unknown}).expression).toBe('string');
        });
        // The row must still match exactly what it matched before the conversion.
        await expect(service.execute('decision')).resolves.toEqual({level: 'high', limit: 1000});
        const failsAge = MutableDecisionService.fromCode(RISK_MODEL_DSL);
        expect(await failsAge.execute('decision')).toEqual({level: 'high', limit: 1000});
    });

    it('DT-002: converting a cross-column "or" expression to cells is refused, not silently emptied', async () => {
        const user = userEvent.setup();
        const {service, container} = renderRisk();

        // Rule 3 is `when: age >= 65 or segment = "premium"` — not representable as an AND-of-cells row.
        await user.click(screen.getByLabelText('rule 3 menu'));
        await user.click(screen.getByRole('menuitem', {name: /use column conditions/i}));

        await waitFor(() => {
            expect(screen.getByRole('alert')).toBeDefined();
        });
        expect(container.textContent).toContain('or');
        const definition = service.get('risk.*') as {'@rules': Array<{when?: {expression?: string}}>};
        expect(definition['@rules'][2].when?.expression).toBe('age >= 65 or segment = "premium"');
    });

    it('DT-003: adding a duplicate output-column name is rejected without touching the model', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('table menu'));
        await user.click(screen.getByRole('menuitem', {name: /add output column/i}));
        await user.type(screen.getByLabelText('Output field name'), 'level');
        await user.click(screen.getByRole('button', {name: 'OK'}));

        expect(await screen.findByText(/already used/i)).toBeDefined();
        // Dialog stays open — the field is still there.
        expect(screen.getByLabelText('Output field name')).toBeDefined();
        const definition = service.get('risk.*') as {'@rules': Array<{then: Record<string, unknown>}>};
        expect(definition['@rules'][0].then).toMatchObject({level: "'high'", limit: 1000});
    });

    it('DT-005: adding a duplicate input-column name is rejected', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('table menu'));
        await user.click(screen.getByRole('menuitem', {name: /add input column/i}));
        await user.type(screen.getByLabelText('Parameter name'), 'age');
        await user.click(screen.getByRole('button', {name: 'OK'}));

        expect(await screen.findByText(/already used/i)).toBeDefined();
        const definition = service.get('risk.*') as {'@parameters': Record<string, unknown>};
        expect(definition['@parameters'].age).toBe('number');
    });

    it('DT-004: renaming an output column to an existing name is rejected instead of merging', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('level column menu'));
        await user.click(screen.getByRole('menuitem', {name: /rename column/i}));
        const field = screen.getByLabelText('Column name');
        await user.clear(field);
        await user.type(field, 'limit');
        await user.click(screen.getByRole('button', {name: 'OK'}));

        expect(await screen.findByText(/already used/i)).toBeDefined();
        const definition = service.get('risk.*') as {'@rules': Array<{then: Record<string, unknown>}>};
        expect(definition['@rules'][0].then).toMatchObject({level: "'high'", limit: 1000});
    });

    it('DT-008: deleting a column requires confirmation and offers undo', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('level column menu'));
        await user.click(screen.getByRole('menuitem', {name: /delete column/i}));
        // Not deleted yet — awaiting confirmation.
        expect(
            (service.get('risk.*') as {'@rules': Array<{then: Record<string, unknown>}>})['@rules'][0].then,
        ).toHaveProperty('level');

        await user.click(screen.getByRole('button', {name: /delete column/i}));
        await waitFor(() => {
            expect(
                (service.get('risk.*') as {'@rules': Array<{then: Record<string, unknown>}>})['@rules'][0].then,
            ).not.toHaveProperty('level');
        });

        await user.click(await screen.findByRole('button', {name: /undo/i}));
        await waitFor(() => {
            expect(
                (service.get('risk.*') as {'@rules': Array<{then: Record<string, unknown>}>})['@rules'][0].then,
            ).toHaveProperty('level');
        });
    });

    it('DT-006/007: switching hit policy away and back restores the default row and priorities', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('Hit policy'));
        await user.click(screen.getByRole('option', {name: /collect matches/i}));
        // Dropping the default under collect-matches is unavoidable (the engine forbids it there);
        // confirm the destructive change.
        await user.click(screen.getByRole('button', {name: /change policy/i}));
        await waitFor(() => {
            expect((service.get('risk.*') as {'@default'?: unknown})['@default']).toBeUndefined();
        });

        await user.click(screen.getByLabelText('Hit policy'));
        await user.click(screen.getByRole('option', {name: /first match/i}));
        await waitFor(() => {
            expect((service.get('risk.*') as {'@default'?: {level?: string}})['@default']?.level).toBe("'none'");
        });
    });

    it('DT-009: renaming the table uses the engine rename API and keeps working at the new path', async () => {
        const user = userEvent.setup();
        const service = MutableDecisionService.fromCode(RISK_MODEL_DSL);
        const onRenamed = vi.fn();
        render(
            <DecisionTableEditor
                service={service}
                path="risk"
                languageService={languageService}
                onRenamed={onRenamed}
            />,
        );

        await user.click(screen.getByLabelText('table menu'));
        await user.click(screen.getByRole('menuitem', {name: /rename table/i}));
        const field = screen.getByLabelText('Table name');
        await user.clear(field);
        await user.type(field, 'riskLevel');
        await user.click(screen.getByRole('button', {name: 'OK'}));

        await waitFor(() => {
            expect(onRenamed).toHaveBeenCalledWith('riskLevel');
        });
        expect(await screen.findByText('riskLevel')).toBeDefined();
        await expect(service.execute('decision')).resolves.toEqual({level: 'high', limit: 1000});
    });

    it('DT-010: renaming an input column uses the engine rename API and relinks the boolean-expression row and the named-argument call site', async () => {
        const user = userEvent.setup();
        const {service, container} = renderRisk();

        await user.click(screen.getByLabelText('age column menu'));
        await user.click(screen.getByRole('menuitem', {name: /rename column/i}));
        const field = screen.getByLabelText('Parameter name');
        await user.clear(field);
        await user.type(field, 'years');
        await user.click(screen.getByRole('button', {name: 'OK'}));

        // Cell-map `when` column and the boolean-expression row's bare identifier both follow the rename.
        await waitFor(() => {
            expect(container.textContent).toContain('years >= 65 or segment = "premium"');
        });
        expect(container.textContent).toContain('years');
        // The external named-argument call site (`decision: risk(age: applicant.age, ...)`) is relinked too.
        await expect(service.execute('decision')).resolves.toEqual({level: 'high', limit: 1000});
    });

    it('DT-013: output columns can be reordered without losing values', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('level column menu'));
        await user.click(screen.getByRole('menuitem', {name: /move right/i}));

        await waitFor(() => {
            const definition = service.get('risk.*') as {'@rules': Array<{then: Record<string, unknown>}>};
            expect(Object.keys(definition['@rules'][0].then).filter((key) => key !== '@kind')).toEqual([
                'limit',
                'level',
            ]);
            expect(definition['@rules'][0].then).toMatchObject({level: "'high'", limit: 1000});
        });
    });

    it('DT-022: an invalid best-match priority is rejected inline instead of being written', async () => {
        const user = userEvent.setup();
        const service = MutableDecisionService.fromCode(BEST_MATCH_MODEL_DSL);
        const {container} = render(
            <DecisionTableEditor service={service} path="tier" languageService={languageService} />,
        );

        const firstRow = container.querySelectorAll('tbody tr')[0] as HTMLElement;
        const priorityCell = cellByText(firstRow, '1');
        await user.dblClick(priorityCell);
        const input = container.querySelector('input[aria-label="rule 1 priority"]') as HTMLInputElement;
        await user.clear(input);
        await user.type(input, '-3{Enter}');

        expect(await screen.findByText(/positive whole number/i)).toBeDefined();
        const definition = service.get('tier.*') as {'@rules': Array<{priority?: number}>};
        expect(definition['@rules'][0].priority).toBe(1);
    });

    it('DT-031: read-only cells are not exposed as buttons or left in the tab order', () => {
        const {container} = renderRisk({readOnly: true});
        const cells = container.querySelectorAll('[data-grid-row]');
        expect(cells.length).toBeGreaterThan(0);
        cells.forEach((cell) => {
            expect(cell.getAttribute('role')).not.toBe('button');
            expect(cell.getAttribute('tabindex')).toBe('-1');
        });
    });

    it("DT-011: an input column's type can be changed after creation", async () => {
        const user = userEvent.setup();
        // `note` isn't referenced by any rule's condition, so retyping it can't conflict with
        // existing comparisons — unlike `age`/`income`/`segment`, which are.
        const service = MutableDecisionService.fromCode(`{
            ruleset risk(age: number, note: <string, default: 'x'>): {
                hitPolicy: "first-match"
                rules: [ { when: { age: 18..25 }, then: { level: "high" } } ]
                default: { level: "none" }
            }
            decision: risk(age: 20)
        }`);
        render(<DecisionTableEditor service={service} path="risk" languageService={languageService} />);

        await user.click(screen.getByLabelText('note column menu'));
        await user.click(screen.getByRole('menuitem', {name: /change type/i}));
        // The name field is locked — only the type is editable here.
        expect(screen.getByLabelText('Parameter name')).toHaveProperty('disabled', true);
        await user.click(screen.getByLabelText('Column type'));
        await user.click(screen.getByRole('option', {name: 'boolean'}));
        await user.click(screen.getByRole('button', {name: 'OK'}));

        await waitFor(() => {
            const definition = service.get('risk.*') as {'@parameters': Record<string, unknown>};
            expect(definition['@parameters'].note).toMatchObject({type: 'boolean'});
        });
    });

    it('DT-012: adding an output column with a chosen type seeds a matching default instead of forcing a string', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('table menu'));
        await user.click(screen.getByRole('menuitem', {name: /add output column/i}));
        await user.type(screen.getByLabelText('Output field name'), 'approved');
        await user.click(screen.getByLabelText('Column type'));
        await user.click(screen.getByRole('option', {name: 'boolean'}));
        await user.click(screen.getByRole('button', {name: 'OK'}));

        await waitFor(() => {
            const definition = service.get('risk.*') as {'@rules': Array<{then: Record<string, unknown>}>};
            expect(definition['@rules'][0].then.approved).toBe(false);
        });
    });

    it('DT-015: the sole output column of a scorecard cannot be deleted (it would be a no-op that misleads)', async () => {
        const user = userEvent.setup();
        const service = MutableDecisionService.fromCode(SCORECARD_MODEL_DSL);
        render(<DecisionTableEditor service={service} path="scoreFactors" languageService={languageService} />);

        await user.click(screen.getByLabelText('score column menu'));
        expect(screen.queryByRole('menuitem', {name: /delete column/i})).toBeNull();
    });

    it('DT-021: the add-column dialog rejects a non-identifier name inline and stays open', async () => {
        const user = userEvent.setup();
        const {service} = renderRisk();

        await user.click(screen.getByLabelText('table menu'));
        await user.click(screen.getByRole('menuitem', {name: /add output column/i}));
        await user.type(screen.getByLabelText('Output field name'), 'not a valid name');
        await user.click(screen.getByRole('button', {name: 'OK'}));

        expect(await screen.findByText(/valid column name/i)).toBeDefined();
        expect(screen.getByLabelText('Output field name')).toBeDefined();
        const definition = service.get('risk.*') as {'@rules': Array<{then: Record<string, unknown>}>};
        expect(Object.keys(definition['@rules'][0].then).filter((key) => key !== '@kind')).toEqual(['level', 'limit']);
    });

    it('DT-023: Move up/down are disabled at the first/last row', async () => {
        const user = userEvent.setup();
        renderRisk();

        await user.click(screen.getByLabelText('rule 1 menu'));
        expect(screen.getByRole('menuitem', {name: /move up/i})).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('menuitem', {name: /move down/i})).not.toHaveAttribute('aria-disabled', 'true');
        await user.keyboard('{Escape}');

        await user.click(screen.getByLabelText('rule 3 menu'));
        expect(screen.getByRole('menuitem', {name: /move down/i})).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('menuitem', {name: /move up/i})).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('DT-026: an empty annotation cell shows a discoverable affordance instead of a blank area', () => {
        const {container} = renderRisk();
        expect(container.textContent).toContain('+ note');
    });

    it('DT-026: read-only tables show no annotation affordance (nothing to add)', () => {
        const {container} = renderRisk({readOnly: true});
        expect(container.textContent).not.toContain('+ note');
    });

    it('DT-028: the parameter signature includes types, not just names', () => {
        const {container} = renderRisk();
        expect(container.textContent).toContain('age: number, income: number, segment: string');
    });

    it('DT-024: Right Arrow from an expression row reaches the first output, Left Arrow returns', async () => {
        const {container} = renderRisk();
        // Rule 3 is the boolean-expression row.
        const expressionCell = cellByText(
            container.querySelectorAll('tbody tr')[2] as HTMLElement,
            'age >= 65 or segment = "premium"',
        );
        expressionCell.focus();
        expect(document.activeElement).toBe(expressionCell);

        expressionCell.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
        await waitFor(() => {
            expect(document.activeElement).not.toBe(expressionCell);
        });
        const afterRight = document.activeElement as HTMLElement;
        expect(afterRight.getAttribute('data-grid-col')).toBe('3'); // first output column

        afterRight.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
        await waitFor(() => {
            expect(document.activeElement).toBe(expressionCell);
        });
    });
});
