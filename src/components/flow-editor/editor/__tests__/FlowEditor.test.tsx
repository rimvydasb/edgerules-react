import {MutableDecisionService} from '@edgerules/node/mutable';
import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {createDocumentationService} from '../../../documentation-service';
import {createFlowEditorService} from '../../service/createFlowEditorService';
import {LOAN_MODEL} from '../../testing/loanModel';
import {SAMPLE_MODEL} from '../../testing/sampleModel';
import {SERVICE_MODEL} from '../../testing/serviceModel';
import {FlowEditor} from '../FlowEditor';
import type {FlowEditorProps, FlowLayout} from '../types';

function renderEditor(props: Partial<FlowEditorProps> & {seeded?: boolean} = {}) {
    const {seeded, ...rest} = props;
    const service = createFlowEditorService(MutableDecisionService.fromCode(SAMPLE_MODEL));
    if (seeded) {
        service.addInputNode('applicant');
        service.setCallee('decision', 'risk');
    }
    render(
        <div style={{width: 1000, height: 600}}>
            <FlowEditor service={service} documentation={createDocumentationService(`fe-${Math.random()}`)} {...rest} />
        </div>,
    );
    return {service};
}

const palette = () => within(screen.getByRole('navigation', {name: 'Node palette'}));

describe('FlowEditor', () => {
    it('shows the empty state and the palette on a model without flow nodes', () => {
        renderEditor();
        expect(screen.getByTestId('flow-editor-empty')).toHaveTextContent('This flow has no nodes yet');
        for (const group of ['Inputs', 'Invocations', 'Outputs', 'Charts']) {
            expect(palette().getByRole('region', {name: group})).toHaveTextContent(new RegExp(`^${group}`, 'i'));
        }
        // A group label has no item count after it.
        expect(palette().getByText('Charts')).toHaveTextContent(/^Charts$/);
        expect(palette().queryByRole('button', {name: 'Add ruleset risk'})).toBeNull();
    });

    it('renders the flow of a service: its parameters, its function nodes and its result', async () => {
        const service = createFlowEditorService(MutableDecisionService.fromCode(SERVICE_MODEL), {root: 'quote'});
        render(
            <div style={{width: 1000, height: 600}}>
                <FlowEditor service={service} />
            </div>,
        );
        expect(await screen.findByTestId('parameter-node-quote.applicant')).toBeInTheDocument();
        expect(screen.getByTestId('parameter-node-quote.amount')).toBeInTheDocument();
        expect(screen.getByTestId('function-node-quote.score')).toBeInTheDocument();
        expect(screen.getByTestId('result-node-quote.return')).toBeInTheDocument();
        // A service has no data inputs, outputs or charts; its result is already on the canvas.
        for (const group of ['Charts', 'Outputs']) expect(palette().queryByRole('region', {name: group})).toBeNull();
        expect(palette().getByRole('button', {name: 'Add parameter'})).toBeInTheDocument();
        expect(palette().queryByRole('button', {name: 'Add result'})).toBeNull();
    });

    it('adds a parameter to a service from the palette', async () => {
        const service = createFlowEditorService(
            MutableDecisionService.fromCode('{ @Service func f(a: number): { b: a } }'),
            {root: 'f'},
        );
        render(
            <div style={{width: 1000, height: 600}}>
                <FlowEditor service={service} />
            </div>,
        );
        fireEvent.click(palette().getByRole('button', {name: 'Add parameter'}));
        expect(await screen.findByTestId('parameter-node-f.param')).toHaveTextContent('number');
        fireEvent.click(palette().getByRole('button', {name: 'Add result'}));
        expect(await screen.findByTestId('result-node-f.return')).toHaveTextContent('{ b }');
    });

    it('renders the annotated fields of the model as nodes', async () => {
        renderEditor({seeded: true});
        expect(await screen.findByTestId('object-input-node-applicant')).toBeInTheDocument();
        expect(screen.getByTestId('function-node-decision')).toBeInTheDocument();
        expect(screen.queryByTestId('flow-editor-empty')).toBeNull();
    });

    it('renders an annotated list as a list input node', async () => {
        const service = createFlowEditorService(
            MutableDecisionService.fromCode('{\n @InputNode(name: "Scores")\n scores: [1, 2, 3]\n}'),
        );
        render(
            <div style={{width: 1000, height: 600}}>
                <FlowEditor service={service} />
            </div>,
        );
        expect(await screen.findByTestId('list-input-node-scores')).toHaveTextContent('Scores');
        expect(screen.queryByTestId('object-input-node-scores')).toBeNull();
    });

    it('renders every expression of the flow context as an expression node, so no read skips a node', async () => {
        const service = createFlowEditorService(
            MutableDecisionService.fromCode(`{
                @InputNode
                applicant: { income: 5000 }
                rate: 0.2
                tax: applicant.income * rate
            }`),
        );
        render(
            <div style={{width: 1000, height: 600}}>
                <FlowEditor service={service} />
            </div>,
        );
        expect(await screen.findByTestId('object-input-node-applicant')).toBeInTheDocument();
        expect(screen.getByTestId('expression-node-rate')).toHaveTextContent('rate');
        expect(screen.getByTestId('expression-node-tax')).toHaveTextContent('tax');
    });

    it('turns an expression node into a list input node when the palette adds the list as an input', async () => {
        const service = createFlowEditorService(MutableDecisionService.fromCode('{ scores: [1, 2, 3] }'));
        render(
            <div style={{width: 1000, height: 600}}>
                <FlowEditor service={service} />
            </div>,
        );
        expect(await screen.findByTestId('expression-node-scores')).toBeInTheDocument();
        fireEvent.click(palette().getByRole('button', {name: /scores/}));
        expect(await screen.findByTestId('list-input-node-scores')).toBeInTheDocument();
        expect(screen.queryByTestId('expression-node-scores')).toBeNull();
    });

    it('reads the model again when the revision changes after a change made outside the editor', async () => {
        const engine = MutableDecisionService.fromCode(SAMPLE_MODEL);
        const service = createFlowEditorService(engine);
        service.setCallee('eligibility', 'applicantDecision');
        const editor = (revision: number) => (
            <div style={{width: 1000, height: 600}}>
                <FlowEditor service={service} revision={revision} />
            </div>
        );
        const {rerender} = render(editor(1));
        const node = await screen.findByTestId('function-node-eligibility');
        const pin = (name: string) => node.querySelector(`[data-handleid="out:${name}"]`);
        expect(pin('reason')).not.toBeNull();

        // Another editor of the same engine adds a result to the callee; the node shows it with the next revision.
        engine.set('applicantDecision.adult', 'person.age >= 21' as never);
        expect(pin('adult')).toBeNull();
        rerender(editor(2));
        await waitFor(() => expect(pin('adult')).not.toBeNull());
    });

    it('selects the node of each new focus request', async () => {
        renderEditor({seeded: true, focusNode: {field: 'decision'}});
        const frame = (testId: string) => screen.getByTestId(testId).closest('.react-flow__node');
        await waitFor(() => expect(frame('function-node-decision')).toHaveClass('selected'));
        expect(frame('object-input-node-applicant')).not.toHaveClass('selected');
    });

    it('clicking Invocation creates a draft node without a callee', async () => {
        const {service} = renderEditor();
        fireEvent.click(palette().getByRole('button', {name: 'Add invocation'}));
        expect(await screen.findByTestId('function-node-node')).toBeInTheDocument();
        expect(service.getFunctionNode('node')).toMatchObject({draft: true, callee: undefined});
    });

    it.each([
        ['Add object input', 'object-input-node-input', 'object-input'],
        ['Add list input', 'list-input-node-list', 'list-input'],
        ['Add value input', 'value-input-node-value', 'value-input'],
    ])('clicking %s creates an input node of that kind', async (name, testId, kind) => {
        const {service} = renderEditor();
        fireEvent.click(palette().getByRole('button', {name}));
        expect(await screen.findByTestId(testId)).toBeInTheDocument();
        expect(service.listNodes()).toEqual([{field: testId.split('-').at(-1), kind}]);
    });

    it('Enter on an item adds it, as a click does', async () => {
        const {service} = renderEditor();
        fireEvent.keyDown(palette().getByRole('button', {name: 'Add input application'}), {key: 'Enter'});
        expect(await screen.findByTestId('object-input-node-application')).toBeInTheDocument();
        expect(service.listNodes()).toEqual([{field: 'application', kind: 'object-input'}]);
        expect(palette().queryByRole('button', {name: 'Add input application'})).toBeNull();
    });

    it('adds an output node without writing to the model', async () => {
        const {service} = renderEditor();
        fireEvent.click(palette().getByRole('button', {name: 'Add output'}));
        expect(await screen.findByTestId('output-node-output')).toBeInTheDocument();
        expect(service.listNodes()).toEqual([]);
    });

    it('reports the layout after a node is added', async () => {
        const onLayoutChange = vi.fn();
        renderEditor({onLayoutChange});
        fireEvent.click(palette().getByRole('button', {name: 'Add output'}));
        await waitFor(() =>
            expect(onLayoutChange).toHaveBeenLastCalledWith({
                positions: {output: expect.objectContaining({x: expect.any(Number), y: expect.any(Number)})},
                outputs: [{id: 'output'}],
            }),
        );
    });

    it('starts from a saved layout', async () => {
        renderEditor({
            seeded: true,
            defaultLayout: {
                positions: {applicant: {x: 40, y: 80}},
                outputs: [{id: 'output', label: 'Risk', source: {node: 'decision', handle: 'out:level'}}],
            },
        });
        expect(await screen.findByTestId('output-node-output')).toHaveTextContent('Risk');
        const applicant = document.querySelector('.react-flow__node[data-id="applicant"]') as HTMLElement;
        expect(applicant.style.transform).toBe('translate(40px,80px)');
    });

    describe('output node menu', () => {
        const RISK = {id: 'output', label: 'Risk', source: {node: 'decision', handle: 'out:level'}};
        // xyflow hides a node it has not measured, and jsdom measures nothing; the menu opens inside the node.
        const openMenu = async () => {
            fireEvent.click(await screen.findByLabelText('Output actions'));
            return screen.findByRole('menu', {hidden: true});
        };
        // A hidden element has no accessible name: find the item by its text.
        const item = (name: string) =>
            within(screen.getByRole('menu', {hidden: true}))
                .getByText(name)
                .closest('[role="menuitem"]')!;
        const lastOutputs = (onLayoutChange: ReturnType<typeof vi.fn>) =>
            (onLayoutChange.mock.lastCall?.[0] as FlowLayout | undefined)?.outputs;

        it('offers Rename node, Duplicate, Add description and Delete', async () => {
            renderEditor({seeded: true, defaultLayout: {positions: {}, outputs: [RISK]}});
            const menu = await openMenu();
            expect(
                within(menu)
                    .getAllByRole('menuitem', {hidden: true})
                    .map((menuItem) => menuItem.textContent),
            ).toEqual(['Rename node', 'Duplicate', 'Add description', 'Delete']);
        });

        it('renames the node in the layout', async () => {
            const onLayoutChange = vi.fn();
            renderEditor({seeded: true, onLayoutChange, defaultLayout: {positions: {}, outputs: [RISK]}});
            await openMenu();
            fireEvent.click(item('Rename node'));
            const input = await screen.findByLabelText('Name of output output');
            fireEvent.change(input, {target: {value: 'Risk level'}});
            fireEvent.keyDown(input, {key: 'Enter'});
            expect(await screen.findByTestId('output-node-output')).toHaveTextContent('Risk level');
            await waitFor(() => expect(lastOutputs(onLayoutChange)).toEqual([{...RISK, label: 'Risk level'}]));
        });

        it('adds and removes a description in the layout', async () => {
            const onLayoutChange = vi.fn();
            renderEditor({seeded: true, onLayoutChange, defaultLayout: {positions: {}, outputs: [RISK]}});
            await openMenu();
            fireEvent.click(item('Add description'));
            const input = await screen.findByLabelText('Description of output output');
            fireEvent.change(input, {target: {value: 'The band of the applicant'}});
            fireEvent.keyDown(input, {key: 'Enter'});
            expect(await screen.findByText('The band of the applicant')).toBeInTheDocument();
            await waitFor(() =>
                expect(lastOutputs(onLayoutChange)).toEqual([{...RISK, description: 'The band of the applicant'}]),
            );

            await openMenu();
            fireEvent.click(item('Remove description'));
            await waitFor(() => expect(screen.queryByText('The band of the applicant')).toBeNull());
            await waitFor(() => expect(lastOutputs(onLayoutChange)).toEqual([RISK]));
        });

        it('duplicates the node with its wire', async () => {
            const onLayoutChange = vi.fn();
            renderEditor({seeded: true, onLayoutChange, defaultLayout: {positions: {}, outputs: [RISK]}});
            await openMenu();
            fireEvent.click(item('Duplicate'));
            const copy = await screen.findByTestId('output-node-output2');
            expect(copy).toHaveTextContent('Risk');
            await waitFor(() => expect(copy).toHaveTextContent("'high'"));
            await waitFor(() => expect(lastOutputs(onLayoutChange)).toEqual([RISK, {...RISK, id: 'output2'}]));
        });

        it('deletes the node from the canvas', async () => {
            const onLayoutChange = vi.fn();
            renderEditor({seeded: true, onLayoutChange, defaultLayout: {positions: {}, outputs: [RISK]}});
            await openMenu();
            fireEvent.click(item('Delete'));
            await waitFor(() => expect(screen.queryByTestId('output-node-output')).toBeNull());
            await waitFor(() => expect(lastOutputs(onLayoutChange)).toEqual([]));
        });

        it('has no menu in read-only mode', async () => {
            renderEditor({seeded: true, readOnly: true, defaultLayout: {positions: {}, outputs: [RISK]}});
            await screen.findByTestId('output-node-output');
            expect(screen.queryByLabelText('Output actions')).toBeNull();
        });
    });

    it('hides the palette in read-only mode', () => {
        renderEditor({readOnly: true});
        expect(screen.queryByRole('navigation', {name: 'Node palette'})).toBeNull();
        expect(screen.getByTestId('flow-editor-empty')).toHaveTextContent('annotated for the flow');
    });

    it('keeps the chart item on the rail', () => {
        renderEditor();
        fireEvent.click(screen.getByRole('button', {name: 'Hide node palette'}));
        expect(palette().getByRole('button', {name: 'Add chart'})).toBeInTheDocument();
    });

    it('collapses the palette to a rail', () => {
        renderEditor();
        fireEvent.click(screen.getByRole('button', {name: 'Hide node palette'}));
        expect(screen.queryByRole('textbox', {name: 'Search nodes'})).toBeNull();
        expect(palette().getByRole('button', {name: 'Add output'})).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Show node palette'}));
        expect(screen.getByRole('textbox', {name: 'Search nodes'})).toBeInTheDocument();
    });
});

describe('FlowEditor charts', () => {
    const SAVED: FlowLayout = {
        positions: {},
        outputs: [],
        charts: [
            {
                id: 'chart',
                label: 'Balance',
                source: {node: 'schedule', handle: 'out:result'},
                size: {width: 520, height: 360},
            },
        ],
    };

    function renderLoan(props: Partial<FlowEditorProps> = {}) {
        const service = createFlowEditorService(MutableDecisionService.fromCode(LOAN_MODEL));
        service.addInputNode('loan');
        service.setCallee('schedule', 'repayment'); // writes @node: FunctionNode, keeping the bindings
        render(
            <div style={{width: 1200, height: 700}}>
                <FlowEditor service={service} {...props} />
            </div>,
        );
        return {service};
    }

    it('adds a chart node without writing to the model', async () => {
        const onLayoutChange = vi.fn();
        const {service} = renderEditor({onLayoutChange});
        fireEvent.click(palette().getByRole('button', {name: 'Add chart'}));
        expect(await screen.findByTestId('chart-node-chart')).toHaveTextContent('Wire a list of records');
        expect(service.listNodes()).toEqual([]);
        await waitFor(() =>
            expect(onLayoutChange).toHaveBeenLastCalledWith(
                expect.objectContaining({outputs: [], charts: [{id: 'chart'}]}),
            ),
        );
    });

    it('starts a chart from a saved layout: its size, its wire and its automatic config', async () => {
        renderLoan({defaultLayout: SAVED});
        // The chart reads through the saved wire; jsdom has no handle bounds, so xyflow draws no edge path.
        expect(await screen.findByRole('img', {name: 'Balance'})).toBeInTheDocument();
        expect(screen.getByTestId('chart-summary')).toHaveTextContent('36 rows · auto');
        const node = document.querySelector('.react-flow__node[data-id="chart"]') as HTMLElement;
        expect(node.style.width).toBe('520px');
        expect(node.style.height).toBe('360px');
    });

    it('reports a config change of a chart in the layout', async () => {
        const onLayoutChange = vi.fn();
        renderLoan({defaultLayout: SAVED, onLayoutChange});
        await screen.findByRole('img', {name: 'Balance'});
        fireEvent.click(screen.getByRole('button', {name: 'Chart actions'}));
        fireEvent.click(await screen.findByRole('menuitem', {name: 'Configure'}));
        const form = await screen.findByRole('form', {name: 'Chart configuration'});
        fireEvent.click(within(form).getByLabelText('Bar'));
        await waitFor(() => {
            const layout = onLayoutChange.mock.lastCall?.[0] as FlowLayout | undefined;
            expect(layout?.charts?.[0]).toMatchObject({
                id: 'chart',
                source: {node: 'schedule', handle: 'out:result'},
                config: {kind: 'bar', x: 'period'},
                size: {width: 520, height: 360},
            });
        });
    });

    it('removes a chart from its menu', async () => {
        const onLayoutChange = vi.fn();
        renderLoan({defaultLayout: SAVED, onLayoutChange});
        await screen.findByRole('img', {name: 'Balance'});
        fireEvent.click(screen.getByRole('button', {name: 'Chart actions'}));
        fireEvent.click(await screen.findByRole('menuitem', {name: 'Remove chart'}));
        await waitFor(() => expect(screen.queryByTestId('chart-node-chart')).toBeNull());
        const layout = onLayoutChange.mock.lastCall?.[0] as FlowLayout;
        expect(layout).not.toHaveProperty('charts');
        expect(Object.keys(layout.positions).sort()).toEqual(['loan', 'schedule']);
    });
});
