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

// A workbook with an input node and a function node.
const WORKBOOK_MODEL = `{
    func riskScore(income: number): { score: income / 100 }
    @Workbook
    loanBook: {
        @InputNode
        applicant: { income: 5000 }
        @FunctionNode
        decision: riskScore(income: applicant.income)
    }
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
    it('starts open; its hide button or the kind icon collapses it to a rail, and a rail icon opens one section', async () => {
        const user = userEvent.setup();
        await renderShell();
        const explorer = () => screen.getByRole('navigation', {name: 'Project explorer'});
        expect(within(explorer()).getByText('limit')).toBeInTheDocument();
        expect(screen.getAllByRole('button', {name: 'Hide project explorer'})).toHaveLength(2);

        await user.click(within(explorer()).getByRole('button', {name: 'Hide project explorer'}));
        expect(within(explorer()).queryByRole('tree')).toBeNull();
        expect(screen.getByRole('button', {name: 'Show project explorer'})).toBeInTheDocument();

        await user.click(within(explorer()).getByRole('button', {name: 'Show Variables'}));
        expect(within(explorer()).getByText('limit')).toBeInTheDocument();
        expect(within(explorer()).queryByText('Customer')).toBeNull();

        await user.click(screen.getByRole('button', {name: 'Hide project explorer', pressed: true}));
        expect(within(explorer()).queryByRole('tree')).toBeNull();
        await user.click(screen.getByRole('button', {name: 'Show project explorer'}));
        expect(within(explorer()).getByRole('tree')).toBeInTheDocument();
    });

    it('opens a clicked entry at its path in the active view', async () => {
        const user = userEvent.setup();
        const {session, onPathChange} = await renderShell({defaultExplorerOpen: true, defaultView: 'code'});
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});

        await user.click(within(explorer).getByText('applicant'));
        expect(onPathChange).toHaveBeenLastCalledWith('applicant');
        expect(breadcrumbItems()).toEqual(['Model', 'applicant']);
        expect(codeView().state.doc.toString()).toBe(session.engine.getCode('applicant'));

        await user.click(screen.getByRole('radio', {name: 'Boxed'}));
        await user.click(within(explorer).getByText('applicant.calculateAge(...)'));
        expect(onPathChange).toHaveBeenLastCalledWith('applicant.calculateAge');
        expect(breadcrumbItems()).toEqual(['Model', 'applicant', 'calculateAge(...)']);

        await user.click(within(explorer).getByText('Customer'));
        expect(breadcrumbItems()).toEqual(['Model', 'Customer']);
        expect(screen.getByRole('treegrid')).toHaveTextContent('income');

        await user.click(within(explorer).getByText('limit'));
        expect(breadcrumbItems()).toEqual(['Model', 'limit']);
        expect(screen.getByTestId('row-limit')).toBeInTheDocument();
    });

    it('keeps the Flow view for an entry with Flow, and shows an entry without Flow in the Boxed view', async () => {
        const user = userEvent.setup();
        const {onViewChange} = await renderShell({defaultExplorerOpen: true, defaultView: 'flow'});
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});

        await user.click(within(explorer).getByText('applicant'));
        expect(breadcrumbItems()).toEqual(['Model', 'applicant']);
        expect(screen.getByRole('radio', {name: 'Flow'})).toHaveAttribute('aria-checked', 'true');
        expect(onViewChange).not.toHaveBeenCalled();

        await user.click(within(explorer).getByText('Customer'));
        expect(onViewChange).toHaveBeenLastCalledWith('boxed');
        expect(breadcrumbItems()).toEqual(['Model', 'Customer']);
    });

    it('centers a clicked workbook node on the canvas of its workbook in the Flow view', async () => {
        const {session} = await openFixtureProject({model: {dsl: WORKBOOK_MODEL}});
        const user = userEvent.setup();
        const {onViewChange} = await renderShell({defaultExplorerOpen: true, defaultView: 'flow'}, session);
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});

        await user.click(within(explorer).getByText('loanBook'));
        expect(breadcrumbItems()).toEqual(['Model', 'loanBook']);
        expect(await screen.findByTestId('function-node-loanBook.decision')).toBeInTheDocument();

        await user.click(within(explorer).getByText('decision'));
        expect(onViewChange).not.toHaveBeenCalled();
        expect(breadcrumbItems()).toEqual(['Model', 'loanBook']);
        await waitFor(() =>
            expect(screen.getByTestId('function-node-loanBook.decision').closest('.react-flow__node')).toHaveClass(
                'selected',
            ),
        );
    });

    it('opens a workbook and its nodes in the Flow view from any other view', async () => {
        const {session} = await openFixtureProject({model: {dsl: WORKBOOK_MODEL}});
        const user = userEvent.setup();
        const {onViewChange} = await renderShell({defaultView: 'code'}, session);
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});

        await user.click(within(explorer).getByText('loanBook'));
        expect(onViewChange).toHaveBeenLastCalledWith('flow');
        expect(breadcrumbItems()).toEqual(['Model', 'loanBook']);

        // The first click expanded the workbook.
        await user.click(screen.getByRole('radio', {name: 'Boxed'}));
        await user.click(within(explorer).getByText('decision'));
        expect(onViewChange).toHaveBeenLastCalledWith('flow');
        expect(breadcrumbItems()).toEqual(['Model', 'loanBook']);
        expect(await screen.findByTestId('function-node-loanBook.decision')).toBeInTheDocument();
    });

    it('offers a panel per workbook in the Flow view of the model root, and opens the clicked one', async () => {
        const {session} = await openFixtureProject({model: {dsl: WORKBOOK_MODEL}});
        const user = userEvent.setup();
        await renderShell({defaultPath: '*', defaultView: 'flow'}, session);

        expect(screen.queryByText('This flow has no nodes yet')).not.toBeInTheDocument();
        await user.click(within(screen.getByTestId('shell-workbook-picker')).getByRole('button', {name: 'loanBook'}));
        expect(breadcrumbItems()).toEqual(['Model', 'loanBook']);
        expect(await screen.findByTestId('function-node-loanBook.decision')).toBeInTheDocument();
    });

    it('offers a panel per service method in the workbook picker, and opens the clicked one', async () => {
        const {session} = await openFixtureProject({
            model: {
                dsl: `{
    @Service
    func quote(income: number): { score: income / 100 }
    func helper(): 1
    @Workbook
    loanBook: { @InputNode applicant: { income: 5000 } }
}`,
            },
        });
        const user = userEvent.setup();
        await renderShell({defaultPath: '*', defaultView: 'flow'}, session);
        const services = screen.getByRole('region', {name: 'Service Methods'});

        // Only the `@Service` function has a panel.
        expect(
            within(services)
                .getAllByRole('button')
                .map((panel) => panel.getAttribute('aria-label')),
        ).toEqual(['quote(...)']);
        expect(within(services).getByText('1 argument')).toBeInTheDocument();
        await user.click(within(services).getByRole('button', {name: 'quote(...)'}));
        expect(breadcrumbItems()).toEqual(['Model', 'quote(...)']);
        expect(screen.getByRole('radio', {name: 'Boxed'})).toHaveAttribute('aria-checked', 'true');
    });

    it('creates a workbook from the add panel of the workbook picker and opens its flow', async () => {
        const {session} = await openFixtureProject({model: {dsl: WORKBOOK_MODEL}});
        const user = userEvent.setup();
        await renderShell({defaultPath: '*', defaultView: 'flow'}, session);

        await user.click(screen.getByRole('button', {name: 'New workbook'}));
        const name = await screen.findByRole('textbox', {name: 'Name'});
        // A root name is taken.
        await user.clear(name);
        await user.type(name, 'loanBook');
        await user.click(screen.getByRole('button', {name: 'Create'}));
        expect(screen.getByText('"loanBook" already exists.')).toBeInTheDocument();

        await user.clear(name);
        await user.type(name, 'pricing');
        await user.click(screen.getByRole('button', {name: 'Create'}));
        expect(session.engine.get('pricing')).toMatchObject({'@kind': 'context', '@node': 'Workbook'});
        expect(breadcrumbItems()).toEqual(['Model', 'pricing']);
        expect(screen.getByRole('radio', {name: 'Flow'})).toHaveAttribute('aria-checked', 'true');
    });

    it('offers no add panel in the workbook picker when read-only', async () => {
        const {session} = await openFixtureProject({model: {dsl: WORKBOOK_MODEL}});
        await renderShell({defaultPath: '*', defaultView: 'flow', readOnly: true}, session);
        expect(screen.getByTestId('shell-workbook-picker')).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'New workbook'})).toBeNull();
    });

    it('opens the model root as the workbook when its nodes have no @Workbook context', async () => {
        const {session} = await openFixtureProject({
            model: {dsl: `{ @InputNode applicant: { income: 5000 }\n limit: 10 }`},
        });
        const user = userEvent.setup();
        const {onViewChange} = await renderShell({defaultPath: 'limit'}, session);
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});

        await user.click(within(explorer).getByText('Model'));
        expect(onViewChange).toHaveBeenLastCalledWith('flow');
        expect(breadcrumbItems()).toEqual(['Model']);
        expect(await screen.findByTestId('object-input-node-applicant')).toBeInTheDocument();
    });

    it('opens the tests of a subject in the Tests view, with the editor views next to it', async () => {
        const {session} = await openFixtureProject({model: {dsl: SHELL_MODEL}});
        session.tests.forSubject('riskScore').addTestCase();
        const user = userEvent.setup();
        const {onViewChange} = await renderShell({defaultExplorerOpen: true}, session);
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});

        // The second `riskScore()` is the entry of the Tests section.
        await user.click(within(explorer).getAllByText('riskScore(...)')[1]!);
        expect(onViewChange).toHaveBeenLastCalledWith('tests');
        expect(breadcrumbItems()).toEqual(['Model', 'riskScore(...)']);
        expect(screen.getByRole('radio', {name: 'Tests'})).toHaveAttribute('aria-checked', 'true');
        for (const name of ['Code', 'Boxed']) expect(screen.getByRole('radio', {name})).toBeEnabled();
        // A function has no nodes, so no Flow view.
        expect(screen.getByRole('radio', {name: 'Flow'})).toBeDisabled();
        expect(await screen.findByText('Test Case 1')).toBeInTheDocument();

        // A crumb opens the model entity again, in the Boxed view.
        await user.click(screen.getByRole('button', {name: 'Model'}));
        expect(onViewChange).toHaveBeenLastCalledWith('boxed');
        expect(screen.getByRole('radio', {name: 'Boxed'})).toHaveAttribute('aria-checked', 'true');
    });

    it('creates a test of a method and opens it', async () => {
        const user = userEvent.setup();
        const {session} = await renderShell({defaultExplorerOpen: true});
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});

        await user.click(within(explorer).getByRole('button', {name: 'Add to Tests'}));
        await user.click(await screen.findByRole('menuitem', {name: 'riskScore(...)'}));

        expect(session.tests.forSubject('riskScore').listTestCases()).toHaveLength(1);
        // The Tests section lists the new subject next to the method.
        expect(within(explorer).getAllByText('riskScore(...)')).toHaveLength(2);
        expect(breadcrumbItems()).toEqual(['Model', 'riskScore(...)']);
        expect(screen.getByRole('radio', {name: 'Tests'})).toHaveAttribute('aria-checked', 'true');
    });

    it('creates a workbook and opens it', async () => {
        const user = userEvent.setup();
        const {session} = await renderShell({defaultExplorerOpen: true});
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});

        await user.click(within(explorer).getByRole('button', {name: 'Add to Workbooks'}));
        const name = await screen.findByRole('textbox', {name: 'Name'});
        await user.clear(name);
        await user.type(name, 'pricing');
        await user.click(screen.getByRole('button', {name: 'Create'}));

        expect(session.engine.get('pricing')).toMatchObject({'@kind': 'context', '@node': 'Workbook'});
        expect(breadcrumbItems()).toEqual(['Model', 'pricing']);
        expect(within(explorer).getByText('pricing')).toBeInTheDocument();
    });

    it('hides the add buttons when read-only', async () => {
        await renderShell({defaultExplorerOpen: true, readOnly: true});
        const explorer = screen.getByRole('navigation', {name: 'Project explorer'});
        expect(within(explorer).queryByRole('button', {name: /^Add to/})).toBeNull();
    });

    it('follows the controlled visibility and only reports a toggle', async () => {
        const user = userEvent.setup();
        const onExplorerOpenChange = vi.fn();
        await renderShell({explorerOpen: false, onExplorerOpenChange});

        await user.click(screen.getByRole('button', {name: 'Show project explorer'}));
        expect(onExplorerOpenChange).toHaveBeenCalledWith(true);
        expect(screen.queryByRole('tree')).toBeNull();
    });
});

describe('Shell view switch', () => {
    it('shows a ruleset, a type or a plain field in the Boxed view, with Flow disabled', async () => {
        const {onViewChange} = await renderShell({defaultPath: 'Customer', defaultView: 'flow'});
        await waitFor(() => expect(onViewChange).toHaveBeenCalledWith('boxed'));
        expect(screen.getByRole('radio', {name: 'Flow'})).toBeDisabled();
        expect(screen.getByRole('radio', {name: 'Boxed'})).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('treegrid')).toHaveTextContent('income');
    });

    it('shows a function in the Boxed view, with Flow disabled', async () => {
        const {onViewChange} = await renderShell({defaultPath: 'riskScore', defaultView: 'flow'});
        await waitFor(() => expect(onViewChange).toHaveBeenCalledWith('boxed'));
        expect(screen.getByRole('radio', {name: 'Flow'})).toBeDisabled();
        expect(screen.queryByTestId('flow-editor')).toBeNull();
    });

    it('shows the code of a type in the Code view', async () => {
        const {session} = await renderShell({defaultPath: 'Customer', defaultView: 'code'});
        expect(codeView().state.doc.toString()).toBe(session.engine.getCode('Customer'));
    });

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
        expect(screen.getByRole('button', {name: 'Hide project explorer', pressed: true})).toHaveFocus();
        // The settings of the root path come before the view switch.
        await user.tab();
        expect(screen.getByRole('button', {name: 'Model settings'})).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('radio', {name: 'Code'})).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        expect(onViewChange).toHaveBeenLastCalledWith('boxed');
        expect(screen.getByRole('radio', {name: 'Boxed'})).toHaveFocus();
        await user.keyboard('{ArrowLeft}{ArrowLeft}');
        expect(onViewChange).toHaveBeenLastCalledWith('flow');
    });
});

const RULESET_MODEL = `{
    ruleset band(age: number): {
        hitPolicy: "first-match"
        rules: [{ when: { age: < 30 }, then: { level: "young" } }]
        default: { level: "none" }
    }
    applicant: { age: 21 }
}`;

describe('Shell Tests view switch', () => {
    it('opens the existing tests of a function from an editor view', async () => {
        const {session} = await openFixtureProject({model: {dsl: SHELL_MODEL}});
        session.tests.forSubject('applicant.calculateAge').addTestCase();
        const user = userEvent.setup();
        const {onViewChange, onPathChange} = await renderShell(
            {defaultPath: 'applicant.calculateAge', defaultView: 'code'},
            session,
        );

        await user.click(screen.getByRole('radio', {name: 'Tests'}));
        expect(onViewChange).toHaveBeenLastCalledWith('tests');
        expect(onPathChange).not.toHaveBeenCalled();
        expect(breadcrumbItems()).toEqual(['Model', 'applicant', 'calculateAge(...)']);
        expect(await screen.findByText('Test Case 1')).toBeInTheDocument();
    });

    it('offers to create the tests of a function without tests, and opens them', async () => {
        const user = userEvent.setup();
        const {session, onViewChange} = await renderShell({defaultPath: 'riskScore'});

        await user.click(screen.getByRole('radio', {name: 'Tests'}));
        expect(onViewChange).not.toHaveBeenCalled();
        await user.click(await screen.findByRole('menuitem', {name: 'Create Tests'}));

        expect(session.tests.forSubject('riskScore').listTestCases()).toHaveLength(1);
        expect(onViewChange).toHaveBeenLastCalledWith('tests');
        expect(screen.getByRole('radio', {name: 'Tests'})).toHaveAttribute('aria-checked', 'true');
        expect(await screen.findByText('Test Case 1')).toBeInTheDocument();
    });

    it('disables Tests for a path that is no test subject, and for a subject without tests when read-only', async () => {
        const {unmount} = await renderShell({defaultPath: 'applicant'});
        expect(screen.getByRole('radio', {name: 'Tests'})).toBeDisabled();
        unmount();

        await renderShell({defaultPath: 'riskScore', readOnly: true});
        expect(screen.getByRole('radio', {name: 'Tests'})).toBeDisabled();
    });

    it('tells why a generic function has no tests, and names its untyped arguments', async () => {
        const {session} = await openFixtureProject({
            model: {dsl: `{ func tierTotals(plan, tier: string, extra): { result: tier } }`},
        });
        const user = userEvent.setup();
        const {onViewChange} = await renderShell({defaultPath: 'tierTotals'}, session);

        await user.click(screen.getByRole('radio', {name: 'Tests'}));
        expect(await screen.findByRole('menuitem', {name: 'Create Tests'})).toBeDisabled();
        expect(screen.getByTestId('shell-untyped-hint')).toHaveTextContent(
            'Only functions with typed arguments can be tested.Add types to plan, extra.',
        );
        await user.click(screen.getByRole('menuitem', {name: 'Create Tests'}));
        expect(onViewChange).not.toHaveBeenCalled();
        expect(session.tests.forSubject('tierTotals').listTestCases()).toHaveLength(0);
    });

    it('shows the test column toggle of the Boxed view for a test subject only', async () => {
        const toggle = () => screen.queryByRole('button', {name: /test column/});
        const {session} = await openFixtureProject({
            model: {dsl: `{ ${SHELL_MODEL.slice(1, -1)}\n func generic(plan): { result: plan } }`},
        });
        const {rerender} = await renderShell({path: '*'}, session);
        const at = (path: string) =>
            rerender(
                <ProjectProvider session={session}>
                    <div style={{width: 1000, height: 700}}>
                        <Shell languageService={MutableDecisionService} path={path} />
                    </div>
                </ProjectProvider>,
            );
        expect(toggle()).toBeInTheDocument();
        at('riskScore');
        expect(toggle()).toBeInTheDocument();
        for (const path of ['Customer', 'applicant', 'limit', 'generic']) {
            at(path);
            expect(breadcrumbItems().at(-1)).toMatch(new RegExp(`^${path}`));
            expect(toggle(), path).toBeNull();
        }
    });

    it('opens the code of a decision table from its tests, with Flow disabled', async () => {
        const {session} = await openFixtureProject({model: {dsl: RULESET_MODEL}});
        session.tests.forSubject('band').addTestCase();
        const user = userEvent.setup();
        const {onViewChange} = await renderShell({defaultPath: 'band', defaultView: 'tests'}, session);
        expect(screen.getByRole('radio', {name: 'Flow'})).toBeDisabled();

        await user.click(screen.getByRole('radio', {name: 'Code'}));
        expect(onViewChange).toHaveBeenLastCalledWith('code');
        expect(codeView().state.doc.toString()).toBe(session.engine.getCode('band'));
        expect(breadcrumbItems()).toEqual(['Model', 'band(...)']);
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
        await openNodeMenu('object-input-node-applicant', 'Open in boxed editor');

        expect(onPathChange).toHaveBeenCalledWith('applicant');
        expect(onViewChange).toHaveBeenCalledWith('boxed');
        expect(onOpenNode).not.toHaveBeenCalled();
        expect(screen.getByRole('treegrid')).toBeInTheDocument();
        expect(breadcrumbItems()).toEqual(['Model', 'applicant']);
    });

    it('opens "View as code" of an invocation node in the Code view at the node path', async () => {
        const {session} = await openFixtureProject({model: {dsl: FLOW_MODEL}});
        const {onPathChange, onViewChange, onOpenNode} = await renderShell({defaultView: 'flow'}, session);
        await openNodeMenu('function-node-decision', 'View as code');

        expect(onOpenNode).not.toHaveBeenCalled();
        expect(onPathChange).toHaveBeenCalledWith('decision');
        expect(onViewChange).toHaveBeenCalledWith('code');
        expect(codeView().state.doc.toString()).toBe(session.engine.getCode('decision'));
    });

    it('opens "Open tests" of a node in the Tests view of the callee', async () => {
        const {session} = await openFixtureProject({model: {dsl: FLOW_MODEL}});
        const {onPathChange, onViewChange, onOpenNode} = await renderShell({defaultView: 'flow'}, session);
        await openNodeMenu('function-node-decision', 'Open tests');

        expect(onOpenNode).not.toHaveBeenCalled();
        expect(onPathChange).toHaveBeenCalledWith('riskScore');
        expect(onViewChange).toHaveBeenCalledWith('tests');
        expect(screen.getByRole('radio', {name: 'Tests'})).toHaveAttribute('aria-checked', 'true');
    });

    it('forwards the target kinds it does not open', async () => {
        const {session} = await openFixtureProject({
            model: {
                dsl: `{
                    ruleset band(age: number): {
                        hitPolicy: "first-match"
                        rules: [{ when: { age: < 30 }, then: { level: "young" } }]
                        default: { level: "none" }
                    }
                    @FunctionNode
                    decision: band(age: 20)
                }`,
            },
        });
        const {onOpenNode} = await renderShell({defaultView: 'flow'}, session);
        await openNodeMenu('function-node-decision', 'Open in decision table editor');
        expect(onOpenNode).toHaveBeenCalledWith({path: 'band', kind: 'ruleset'});
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
        ['Customer.name', 'Customer'],
        ['applicant.age.value', 'applicant.age'],
        ['applicant.missing.deeper', 'applicant'],
    ])('opens the nearest valid ancestor of %s', async (requested, expected) => {
        const {onPathChange} = await renderShell({defaultPath: requested});
        await waitFor(() => expect(onPathChange).toHaveBeenCalledWith(expected));
        expect(breadcrumbItems().length).toBe(expected === '*' ? 1 : expected.split('.').length + 1);
    });

    it('reports the fallback of a controlled path', async () => {
        const {onPathChange} = await renderShell({path: 'applicant.address.missing'});
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

        expect(await screen.findByTestId('object-input-node-applicant')).toBeInTheDocument();
        expect(screen.queryByTestId('object-input-node-applicant.profile')).toBeNull();
        expect(screen.getByText('Model output')).toBeInTheDocument();

        // Another root mounts another canvas with its own layout.
        await user.click(screen.getByRole('radio', {name: 'Code'}));
        await user.click(screen.getByRole('radio', {name: 'Flow'}));
        expect(await screen.findByTestId('object-input-node-applicant')).toBeInTheDocument();
    });

    it('stores the layout of a root path under that root', async () => {
        const {session} = await openFixtureProject({
            model: {dsl: `{ applicant: { income: 5000; profile: { tier: 1 } } }`},
        });
        const user = userEvent.setup();
        await renderShell({defaultView: 'flow', defaultPath: 'applicant'}, session);
        // The node palette of the Shell starts collapsed.
        await user.click(await screen.findByRole('button', {name: 'Show node palette'}));

        await user.click(screen.getByRole('button', {name: 'Add input applicant.profile'}));
        expect(await screen.findByTestId('object-input-node-applicant.profile')).toBeInTheDocument();

        await waitFor(() =>
            expect(session.getSlice('flow').layouts.applicant?.positions).toHaveProperty(['applicant.profile']),
        );
        expect(session.getSlice('flow').layouts).not.toHaveProperty('*');
        expect(session.engine.getCode('applicant')).toContain('@InputNode');
    });
});

describe('Shell split screen', () => {
    // The workbook with an output node that reads the whole result of `decision`.
    async function openWorkbook() {
        const {session} = await openFixtureProject({
            model: {dsl: WORKBOOK_MODEL},
            flow: {
                schemaVersion: 2,
                layouts: {
                    loanBook: {
                        positions: {},
                        outputs: [
                            {id: 'output', label: 'Decision', source: {node: 'loanBook.decision', handle: 'out:*'}},
                        ],
                    },
                },
            },
        });
        return session;
    }

    function nodeOf(testId: string): HTMLElement {
        return screen.getByTestId(testId).closest<HTMLElement>('.react-flow__node')!;
    }

    it('is off by default and enabled only in the Flow view', async () => {
        const user = userEvent.setup();
        await renderShell({defaultPath: 'applicant'});
        const toggle = screen.getByRole('button', {name: 'Split screen'});
        expect(toggle).toBeDisabled();
        expect(toggle).toHaveAttribute('aria-pressed', 'false');

        await user.click(screen.getByRole('radio', {name: 'Flow'}));
        expect(toggle).toBeEnabled();
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows the callee of a function node and an input node in a Boxed Editor, follows the selection and closes on a canvas click', async () => {
        const session = await openWorkbook();
        const user = userEvent.setup();
        await renderShell({defaultPath: 'loanBook', defaultView: 'flow'}, session);
        await screen.findByTestId('function-node-loanBook.decision');

        // Off: a selected node opens nothing. A click, not a press: d3-drag needs a real window on mousedown.
        fireEvent.click(nodeOf('function-node-loanBook.decision'));
        await waitFor(() => expect(nodeOf('function-node-loanBook.decision')).toHaveClass('selected'));
        expect(screen.queryByTestId('shell-split-panel')).toBeNull();

        await user.click(screen.getByRole('button', {name: 'Split screen'}));
        const panel = await screen.findByTestId('shell-split-panel');
        // A function node shows the body of the function it calls, not the call site.
        expect(within(panel).getByRole('treegrid')).toBeInTheDocument();
        expect(within(panel).getByTestId('row-riskScore.score')).toBeInTheDocument();
        expect(within(panel).queryByTestId('row-loanBook.decision')).toBeNull();

        // Another node renders another Boxed Editor.
        fireEvent.click(nodeOf('object-input-node-loanBook.applicant'));
        await waitFor(() => expect(within(panel).getByTestId('row-loanBook.applicant')).toBeInTheDocument());
        expect(within(panel).queryByTestId('row-riskScore.score')).toBeNull();

        fireEvent.click(screen.getByTestId('shell').querySelector<HTMLElement>('.react-flow__pane')!);
        await waitFor(() => expect(screen.queryByTestId('shell-split-panel')).toBeNull());
    });

    it('shows the full data wired into an output node', async () => {
        const session = await openWorkbook();
        const user = userEvent.setup();
        await renderShell({defaultPath: 'loanBook', defaultView: 'flow'}, session);
        await user.click(screen.getByRole('button', {name: 'Split screen'}));

        fireEvent.click(nodeOf('output-node-output'));
        const sheet = await screen.findByTestId('sink-sheet');
        expect(within(sheet).getByText('Decision')).toBeInTheDocument();
        expect(within(sheet).getByText('loanBook.decision')).toBeInTheDocument();
        expect(await within(sheet).findByText('score')).toBeInTheDocument();
        expect(within(sheet).getByText('50')).toBeInTheDocument();
    });

    it('opens for an output node that shows only a part of its value', async () => {
        const {session} = await openFixtureProject({
            model: {
                dsl: `{
    func counting(count: number): for i in 1..count return i
    @Workbook
    countBook: {
        @FunctionNode
        many: counting(count: 12)
        @FunctionNode
        few: counting(count: 3)
    }
}`,
            },
            flow: {
                schemaVersion: 2,
                layouts: {
                    countBook: {
                        positions: {},
                        outputs: [
                            {id: 'output', source: {node: 'countBook.few', handle: 'out:result'}},
                            {id: 'output2', source: {node: 'countBook.many', handle: 'out:result'}},
                        ],
                    },
                },
            },
        });
        await renderShell({defaultPath: 'countBook', defaultView: 'flow'}, session);
        const toggle = await screen.findByRole('button', {name: 'Split screen'});

        // Three items fit in the node: the split screen stays off.
        await waitFor(() => expect(screen.getByTestId('output-node-output')).toHaveAttribute('data-shape', 'list'));
        fireEvent.click(nodeOf('output-node-output'));
        await waitFor(() => expect(nodeOf('output-node-output')).toHaveClass('selected'));
        expect(toggle).toHaveAttribute('aria-pressed', 'false');

        // Twelve items do not: the split screen opens with the full list.
        fireEvent.click(nodeOf('output-node-output2'));
        await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
        const sheet = await screen.findByTestId('sink-sheet');
        expect(await within(sheet).findByText('[12]')).toBeInTheDocument();
    });

    it('opens for an input node that shows only a part of its data', async () => {
        const {session} = await openFixtureProject({
            model: {
                dsl: `{
    @Workbook
    listBook: {
        @InputNode
        many: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        @InputNode
        few: [1, 2, 3]
    }
}`,
            },
        });
        await renderShell({defaultPath: 'listBook', defaultView: 'flow'}, session);
        const toggle = await screen.findByRole('button', {name: 'Split screen'});

        // Three items fit in the node: the split screen stays off.
        await waitFor(() => expect(screen.getAllByTestId('list-input-table')).toHaveLength(2));
        fireEvent.click(nodeOf('list-input-node-listBook.few'));
        await waitFor(() => expect(nodeOf('list-input-node-listBook.few')).toHaveClass('selected'));
        expect(toggle).toHaveAttribute('aria-pressed', 'false');

        // Twelve items do not: the split screen opens with the list in a Boxed Editor.
        fireEvent.click(nodeOf('list-input-node-listBook.many'));
        await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
        expect(await screen.findByTestId('shell-split-panel')).toBeInTheDocument();
    });
});
