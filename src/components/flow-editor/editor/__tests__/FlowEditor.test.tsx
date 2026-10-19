import {MutableDecisionService} from '@edgerules/node/mutable';
import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {createDocumentationService} from '../../../documentation-service';
import {createFlowEditorService} from '../../service/createFlowEditorService';
import {LOAN_MODEL} from '../../testing/loanModel';
import {SAMPLE_MODEL} from '../../testing/sampleModel';
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
        for (const group of ['Inputs', 'Functions & rulesets', 'Outputs']) {
            expect(palette().getByRole('region', {name: group})).toBeInTheDocument();
        }
    });

    it('renders the annotated fields of the model as nodes', async () => {
        renderEditor({seeded: true});
        expect(await screen.findByTestId('input-node-applicant')).toBeInTheDocument();
        expect(screen.getByTestId('function-node-decision')).toBeInTheDocument();
        expect(screen.queryByTestId('flow-editor-empty')).toBeNull();
    });

    it('clicking a callee creates a draft node with that callee', async () => {
        const {service} = renderEditor();
        fireEvent.click(palette().getByRole('button', {name: 'Add ruleset risk'}));
        expect(await screen.findByTestId('function-node-node')).toBeInTheDocument();
        expect(service.getFunctionNode('node')).toMatchObject({draft: true, callee: {path: 'risk'}});
    });

    it('Enter on an item adds it, as a click does', async () => {
        const {service} = renderEditor();
        fireEvent.keyDown(palette().getByRole('button', {name: 'Add input application'}), {key: 'Enter'});
        expect(await screen.findByTestId('input-node-application')).toBeInTheDocument();
        expect(service.listNodes()).toEqual([{field: 'application', kind: 'input'}]);
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
