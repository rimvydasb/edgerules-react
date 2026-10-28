import 'fake-indexeddb/auto';
import {EditorView} from '@codemirror/view';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {ProjectProvider, type ProjectSession} from '../../project-session';
import {openFixtureProject} from '../../project-session/testing/sessionFixture';
import {Shell} from '../Shell';
import type {ShellProps} from '../shell-types';

// The sample model of model-decomposition.md, with a function inside a context.
const SHELL_MODEL = `{
    type Customer: { name: <string>; income: <number, 0> }
    func riskScore(income: number): { score: income / 100 }
    applicant: {
        age: 21
        address: { city: "Vilnius"; zip: "01100" }
        func calculateAge(year: number): { result: 2026 - year }
    }
    loans: [1, 2]
    limit: riskScore(applicant.age).score
}`;

async function renderShell(props: Partial<ShellProps> = {}, session?: ProjectSession) {
    const opened = session ?? (await openFixtureProject({model: {dsl: SHELL_MODEL}})).session;
    const onPathChange = vi.fn<(path: string) => void>();
    const onViewChange = vi.fn<(view: string) => void>();
    const onOpenNode = vi.fn();
    const result = render(
        <ProjectProvider session={opened}>
            <div style={{width: 1000, height: 700}}>
                <Shell
                    languageService={MutableDecisionService}
                    onPathChange={onPathChange}
                    onViewChange={onViewChange}
                    onOpenNode={onOpenNode}
                    {...props}
                />
            </div>
        </ProjectProvider>,
    );
    return {session: opened, onPathChange, onViewChange, onOpenNode, ...result};
}

function breadcrumbItems(): string[] {
    const nav = screen.getByRole('navigation', {name: 'Model path'});
    return Array.from(nav.querySelectorAll('button, [aria-current]')).map((item) => item.textContent ?? '');
}

function codeView(): EditorView {
    const dom = screen.getByTestId('shell').querySelector('.cm-editor');
    const view = dom && EditorView.findFromDOM(dom as HTMLElement);
    if (!view) throw new Error('The Code view is not shown');
    return view;
}

function typeCode(code: string): void {
    const view = codeView();
    act(() => view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: code}}));
}

describe('Shell breadcrumb', () => {
    it('shows the fully qualified root path, a function last with (...)', async () => {
        await renderShell({defaultPath: 'applicant.calculateAge'});
        expect(breadcrumbItems()).toEqual(['Model', 'applicant', 'calculateAge(...)']);
        expect(screen.getByText('calculateAge(...)')).toHaveAttribute('aria-current', 'page');
    });

    it('shows only Model for the whole model', async () => {
        await renderShell();
        expect(breadcrumbItems()).toEqual(['Model']);
    });

    it('opens the path of a clicked item', async () => {
        const user = userEvent.setup();
        const {onPathChange} = await renderShell({defaultPath: 'applicant.address'});
        await user.click(screen.getByRole('button', {name: 'applicant'}));
        expect(onPathChange).toHaveBeenCalledWith('applicant');
        expect(breadcrumbItems()).toEqual(['Model', 'applicant']);

        await user.click(screen.getByRole('button', {name: 'Model'}));
        expect(onPathChange).toHaveBeenLastCalledWith('*');
        expect(breadcrumbItems()).toEqual(['Model']);
    });

    it('follows the controlled path and only reports a click', async () => {
        const user = userEvent.setup();
        const {onPathChange} = await renderShell({path: 'applicant.address'});
        await user.click(screen.getByRole('button', {name: 'applicant'}));
        expect(onPathChange).toHaveBeenCalledWith('applicant');
        // The host did not set the new path.
        expect(breadcrumbItems()).toEqual(['Model', 'applicant', 'address']);
    });
});

describe('Shell project explorer', () => {
    it('opens with the kind icon and closes with its close button or the kind icon', async () => {
        const user = userEvent.setup();
        await renderShell();
        expect(screen.queryByRole('navigation', {name: 'Project explorer'})).toBeNull();

        await user.click(screen.getByRole('button', {name: 'Show project explorer'}));
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});
        expect(within(explorer).getByText('applicant')).toBeInTheDocument();
        expect(screen.getAllByRole('button', {name: 'Hide project explorer'})).toHaveLength(2);

        await user.click(within(explorer).getByRole('button', {name: 'Hide project explorer'}));
        expect(screen.queryByRole('navigation', {name: 'Project explorer'})).toBeNull();

        await user.click(screen.getByRole('button', {name: 'Show project explorer'}));
        await user.click(screen.getByRole('button', {name: 'Hide project explorer', pressed: true}));
        expect(screen.queryByRole('navigation', {name: 'Project explorer'})).toBeNull();
    });

    it('opens the clicked context or function as the root path', async () => {
        const user = userEvent.setup();
        const {onPathChange} = await renderShell({defaultExplorerOpen: true});
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});

        await user.click(within(explorer).getByText('applicant'));
        expect(onPathChange).toHaveBeenLastCalledWith('applicant');
        expect(breadcrumbItems()).toEqual(['Model', 'applicant']);

        await user.click(await within(explorer).findByText('calculateAge()'));
        expect(onPathChange).toHaveBeenLastCalledWith('applicant.calculateAge');
        expect(breadcrumbItems()).toEqual(['Model', 'applicant', 'calculateAge(...)']);
    });

    it('follows the controlled visibility and only reports a toggle', async () => {
        const user = userEvent.setup();
        const onExplorerOpenChange = vi.fn();
        await renderShell({explorerOpen: false, onExplorerOpenChange});

        await user.click(screen.getByRole('button', {name: 'Show project explorer'}));
        expect(onExplorerOpenChange).toHaveBeenCalledWith(true);
        expect(screen.queryByRole('navigation', {name: 'Project explorer'})).toBeNull();
    });
});

describe('Shell view switch', () => {
    it('starts in the Boxed view and switches views at the same root path', async () => {
        const user = userEvent.setup();
        const {session, onViewChange, onPathChange} = await renderShell({defaultPath: 'applicant'});
        expect(screen.getByRole('treegrid')).toBeInTheDocument();

        await user.click(screen.getByRole('radio', {name: 'Code'}));
        expect(onViewChange).toHaveBeenCalledWith('code');
        expect(codeView().state.doc.toString()).toBe(session.engine.getCode('applicant'));
        expect(screen.queryByRole('treegrid')).toBeNull();

        await user.click(screen.getByRole('radio', {name: 'Flow'}));
        expect(await screen.findByTestId('flow-editor')).toBeInTheDocument();
        expect(onPathChange).not.toHaveBeenCalled();
        expect(breadcrumbItems()).toEqual(['Model', 'applicant']);
    });

    it('does not report the current view again', async () => {
        const user = userEvent.setup();
        const {onViewChange} = await renderShell({defaultView: 'code'});
        await user.click(screen.getByRole('radio', {name: 'Code'}));
        expect(onViewChange).not.toHaveBeenCalled();
    });

    it('moves the view with the arrow keys, like a radio group', async () => {
        const user = userEvent.setup();
        const {onViewChange} = await renderShell({defaultView: 'code'});
        expect(screen.getByRole('radio', {name: 'Code'})).toHaveAttribute('aria-checked', 'true');

        // The kind icon, the Project Explorer toggle, comes first.
        await user.tab();
        expect(screen.getByRole('button', {name: 'Show project explorer'})).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('radio', {name: 'Code'})).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        expect(onViewChange).toHaveBeenLastCalledWith('boxed');
        expect(screen.getByRole('radio', {name: 'Boxed'})).toHaveFocus();
        await user.keyboard('{ArrowLeft}{ArrowLeft}');
        expect(onViewChange).toHaveBeenLastCalledWith('flow');
    });
});

describe('Shell drill-down', () => {
    async function chooseRowAction(user: ReturnType<typeof userEvent.setup>, path: string, label: string) {
        await user.click(within(screen.getByTestId(`row-${path}`)).getByLabelText('Open row actions'));
        await user.click(screen.getByText(label));
    }

    it('opens "View as code" of a function in the Code view at the function path', async () => {
        const user = userEvent.setup();
        const {session, onPathChange, onViewChange, onOpenNode} = await renderShell({defaultPath: 'applicant'});
        await chooseRowAction(user, 'applicant.calculateAge', 'View as code');

        expect(onPathChange).toHaveBeenCalledWith('applicant.calculateAge');
        expect(onViewChange).toHaveBeenCalledWith('code');
        expect(onOpenNode).not.toHaveBeenCalled();
        expect(breadcrumbItems()).toEqual(['Model', 'applicant', 'calculateAge(...)']);
        expect(codeView().state.doc.toString()).toBe(session.engine.getCode('applicant.calculateAge'));
    });

    const FLOW_MODEL = `{
        func riskScore(income: number): { score: income / 100 }
        @InputNode
        applicant: { income: 5000 }
        @FunctionNode
        decision: riskScore(income: applicant.income)
    }`;

    async function openNodeMenu(node: string, item: string) {
        const frame = await screen.findByTestId(node);
        fireEvent.click(within(frame).getByLabelText('Node actions'));
        fireEvent.click(await screen.findByText(item));
    }

    it('opens a record of the Flow view in the Boxed view at its path', async () => {
        const {session} = await openFixtureProject({model: {dsl: FLOW_MODEL}});
        const {onPathChange, onViewChange, onOpenNode} = await renderShell({defaultView: 'flow'}, session);
        await openNodeMenu('input-node-applicant', 'Open in boxed editor');

        expect(onPathChange).toHaveBeenCalledWith('applicant');
        expect(onViewChange).toHaveBeenCalledWith('boxed');
        expect(onOpenNode).not.toHaveBeenCalled();
        expect(screen.getByRole('treegrid')).toBeInTheDocument();
        expect(breadcrumbItems()).toEqual(['Model', 'applicant']);
    });

    it('forwards a target that is not a valid root path to the host', async () => {
        const {session} = await openFixtureProject({model: {dsl: FLOW_MODEL}});
        const {onPathChange, onViewChange, onOpenNode} = await renderShell({defaultView: 'flow'}, session);
        // An invocation is not a context: its "View as code" goes to the host.
        await openNodeMenu('function-node-decision', 'View as code');

        expect(onOpenNode).toHaveBeenCalledWith({path: 'decision', kind: 'code-editor'});
        expect(onPathChange).not.toHaveBeenCalled();
        expect(onViewChange).not.toHaveBeenCalled();
    });

    it('forwards the target kinds it does not open', async () => {
        const {session} = await openFixtureProject({model: {dsl: FLOW_MODEL}});
        const {onOpenNode} = await renderShell({defaultView: 'flow'}, session);
        await openNodeMenu('function-node-decision', 'Open tests');
        expect(onOpenNode).toHaveBeenCalledWith({path: 'riskScore', kind: 'tests'});
    });
});

describe('Shell Code view', () => {
    it('commits the code of a context path after the idle time', async () => {
        const {session} = await renderShell({defaultPath: 'applicant.address', defaultView: 'code'});
        typeCode('{ city: "Kaunas"; zip: "01100" }');
        expect(session.engine.getCode('applicant.address')).toContain('Vilnius');

        await waitFor(() => expect(session.engine.getCode('applicant.address')).toContain('Kaunas'));
        expect(screen.queryByTestId('shell-status')).toBeNull();
    });

    it('commits the whole model through commitDsl', async () => {
        const {session} = await renderShell({defaultView: 'code'});
        typeCode(session.getDslDraft().replace('age: 21', 'age: 30'));
        expect(session.getSnapshot().hasDslDraft).toBe(true);

        await waitFor(() => expect(session.getSnapshot().hasDslDraft).toBe(false));
        expect(session.engine.getCode('applicant.age')).toBe('30');
    });

    it('commits a pending edit before a view switch', async () => {
        const user = userEvent.setup();
        const {session} = await renderShell({defaultPath: 'applicant.calculateAge', defaultView: 'code'});
        typeCode('func calculateAge(year: number): { result: 2030 - year }');
        await user.click(screen.getByRole('radio', {name: 'Boxed'}));

        expect(session.engine.getCode('applicant.calculateAge')).toContain('2030 - year');
        expect(screen.getByRole('treegrid')).toHaveTextContent('2030 - year');
    });

    it('commits a pending edit before a path change', async () => {
        const user = userEvent.setup();
        const {session} = await renderShell({defaultPath: 'applicant.address', defaultView: 'code'});
        typeCode('{ city: "Riga"; zip: "01100" }');
        await user.click(screen.getByRole('button', {name: 'applicant'}));

        expect(session.engine.getCode('applicant.address')).toContain('Riga');
        expect(codeView().state.doc.toString()).toBe(session.engine.getCode('applicant'));
    });
});

describe('Shell invalid draft', () => {
    it('keeps an invalid draft of a path, shows the error, and shows the draft again on return', async () => {
        const user = userEvent.setup();
        const {session} = await renderShell({defaultPath: 'applicant.address', defaultView: 'code'});
        const before = session.engine.getCode('applicant.address');
        typeCode('{ city: ( }');

        expect(await screen.findByTestId('shell-status', {}, {timeout: 2000})).toHaveTextContent(/parse/i);
        expect(session.engine.getCode('applicant.address')).toBe(before);

        await user.click(screen.getByRole('radio', {name: 'Boxed'}));
        // The Boxed view shows the last committed model.
        expect(screen.getByRole('treegrid')).toHaveTextContent('Vilnius');

        await user.click(screen.getByRole('radio', {name: 'Code'}));
        expect(codeView().state.doc.toString()).toBe('{ city: ( }');
        expect(screen.getByTestId('shell-status')).toBeInTheDocument();

        typeCode('{ city: "Kaunas"; zip: "01100" }');
        await waitFor(() => expect(screen.queryByTestId('shell-status')).toBeNull());
        expect(session.engine.getCode('applicant.address')).toContain('Kaunas');
    });

    it('rolls back code that parses but does not link', async () => {
        const {session} = await renderShell({defaultPath: 'applicant', defaultView: 'code'});
        const before = session.engine.exportDsl();
        typeCode('{ age: missing + 1 }');

        expect(await screen.findByTestId('shell-status', {}, {timeout: 2000})).toHaveTextContent('missing');
        expect(session.engine.exportDsl()).toBe(before);
    });

    it('refuses function code with another function name', async () => {
        const {session} = await renderShell({defaultPath: 'applicant.calculateAge', defaultView: 'code'});
        typeCode('func otherName(year: number): { result: 1 }');

        expect(await screen.findByTestId('shell-status', {}, {timeout: 2000})).toHaveTextContent('otherName');
        expect(session.engine.getCode('applicant.calculateAge')).toContain('calculateAge');
    });

    it('leaves an invalid draft of the whole model in the session', async () => {
        const user = userEvent.setup();
        const {session} = await renderShell({defaultView: 'code'});
        typeCode('{ broken: ( }');

        expect(await screen.findByTestId('shell-status', {}, {timeout: 2000})).toBeInTheDocument();
        expect(session.getSnapshot()).toMatchObject({hasDslDraft: true, dslValidity: {status: 'invalid'}});

        await user.click(screen.getByRole('radio', {name: 'Boxed'}));
        await user.click(screen.getByRole('radio', {name: 'Code'}));
        expect(codeView().state.doc.toString()).toBe('{ broken: ( }');
    });
});

describe('Shell root path', () => {
    it.each([
        ['loans[0]', '*'],
        ['applicant.calculateAge.result', 'applicant.calculateAge'],
        ['limit', '*'],
        ['Customer', '*'],
        ['applicant.age', 'applicant'],
        ['applicant.missing.deeper', 'applicant'],
    ])('opens the nearest valid ancestor of %s', async (requested, expected) => {
        const {onPathChange} = await renderShell({defaultPath: requested});
        await waitFor(() => expect(onPathChange).toHaveBeenCalledWith(expected));
        expect(breadcrumbItems().length).toBe(expected === '*' ? 1 : expected.split('.').length + 1);
    });

    it('reports the fallback of a controlled path', async () => {
        const {onPathChange} = await renderShell({path: 'applicant.address.city'});
        await waitFor(() => expect(onPathChange).toHaveBeenCalledWith('applicant.address'));
        expect(breadcrumbItems()).toEqual(['Model', 'applicant', 'address']);
    });

    it('falls back to the nearest existing path when a rename removes the root path', async () => {
        const {session, onPathChange} = await renderShell({defaultPath: 'applicant.address'});
        act(() => {
            expect(session.execute({type: 'renamePath', path: 'applicant.address', newName: 'home'})).toEqual({
                ok: true,
            });
        });
        await waitFor(() => expect(onPathChange).toHaveBeenCalledWith('applicant'));
        expect(breadcrumbItems()).toEqual(['Model', 'applicant']);
    });

    it('falls back when a remove deletes the root path', async () => {
        const {session, onPathChange} = await renderShell({defaultPath: 'applicant.address'});
        act(() => {
            session.engine.remove('applicant.address');
        });
        await waitFor(() => expect(onPathChange).toHaveBeenCalledWith('applicant'));
        expect(breadcrumbItems()).toEqual(['Model', 'applicant']);
    });
});

describe('Shell Flow view', () => {
    it('shows the direct nodes of the root path with the layout of that root', async () => {
        const {session} = await openFixtureProject({
            model: {
                dsl: `{
                    func riskScore(income: number): { score: income / 100 }
                    @InputNode
                    applicant: {
                        income: 5000
                        @InputNode
                        profile: { tier: 1 }
                    }
                }`,
            },
            flow: {
                schemaVersion: 2,
                layouts: {
                    '*': {positions: {}, outputs: [{id: 'output', label: 'Model output'}]},
                    applicant: {positions: {}, outputs: [{id: 'output', label: 'Applicant output'}]},
                },
            },
        });
        const user = userEvent.setup();
        await renderShell({defaultView: 'flow'}, session);

        expect(await screen.findByTestId('input-node-applicant')).toBeInTheDocument();
        expect(screen.queryByTestId('input-node-applicant.profile')).toBeNull();
        expect(screen.getByText('Model output')).toBeInTheDocument();

        // Another root mounts another canvas with its own layout.
        await user.click(screen.getByRole('radio', {name: 'Code'}));
        await user.click(screen.getByRole('radio', {name: 'Flow'}));
        expect(await screen.findByTestId('input-node-applicant')).toBeInTheDocument();
    });

    it('stores the layout of a root path under that root', async () => {
        const {session} = await openFixtureProject({
            model: {dsl: `{ applicant: { income: 5000; profile: { tier: 1 } } }`},
        });
        const user = userEvent.setup();
        await renderShell({defaultView: 'flow', defaultPath: 'applicant'}, session);

        await user.click(screen.getByRole('button', {name: 'Add input applicant.profile'}));
        expect(await screen.findByTestId('input-node-applicant.profile')).toBeInTheDocument();

        await waitFor(() =>
            expect(session.getSlice('flow').layouts.applicant?.positions).toHaveProperty(['applicant.profile']),
        );
        expect(session.getSlice('flow').layouts).not.toHaveProperty('*');
        expect(session.engine.getCode('applicant')).toContain('@InputNode');
    });
});
