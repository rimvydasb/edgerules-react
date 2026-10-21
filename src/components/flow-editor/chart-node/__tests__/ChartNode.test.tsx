import {MutableDecisionService} from '@edgerules/node/mutable';
import {ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeChange} from '@xyflow/react';
import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {FlowEditorProvider} from '../../FlowEditorProvider';
import {FunctionNode} from '../../function-node/FunctionNode';
import {createFlowEditorService} from '../../service/createFlowEditorService';
import {LOAN_MODEL} from '../../testing/loanModel';
import {ChartNode} from '../ChartNode';
import type {ChartConfig} from '../types';

const nodeTypes = {functionNode: FunctionNode, chartNode: ChartNode};

function renderChart(
    options: {
        wire?: {source: string; handle: string};
        config?: ChartConfig;
        readOnly?: boolean;
    } = {},
) {
    const service = createFlowEditorService(MutableDecisionService.fromCode(LOAN_MODEL));
    const onNodesChange = vi.fn<(changes: NodeChange[]) => void>();
    const nodes: Node[] = [
        {id: 'schedule', type: 'functionNode', position: {x: 0, y: 0}, data: {field: 'schedule'}},
        {id: 'cost', type: 'functionNode', position: {x: 0, y: 300}, data: {field: 'cost'}},
        {
            id: 'chart',
            type: 'chartNode',
            position: {x: 500, y: 0},
            data: {label: 'Repayment', config: options.config},
            width: 440,
            height: 340,
        },
    ];
    const edges: Edge[] = options.wire
        ? [
              {
                  id: 'wire',
                  source: options.wire.source,
                  sourceHandle: options.wire.handle,
                  target: 'chart',
                  targetHandle: 'in:data',
              },
          ]
        : [];
    render(
        <ReactFlowProvider>
            <FlowEditorProvider service={service} readOnly={options.readOnly}>
                <div style={{width: 1000, height: 700}}>
                    <ReactFlow
                        defaultNodes={nodes}
                        defaultEdges={edges}
                        nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange}
                    />
                </div>
            </FlowEditorProvider>
        </ReactFlowProvider>,
    );
    return {service, onNodesChange};
}

const SCHEDULE = {source: 'schedule', handle: 'out:result'};
const COST = {source: 'cost', handle: 'out:*'};

async function openMenu() {
    fireEvent.click(screen.getByRole('button', {name: 'Chart actions'}));
    return screen.findByRole('menu');
}

describe('ChartNode', () => {
    it('asks for data while nothing is wired, and has nothing to configure', async () => {
        renderChart();
        expect(screen.getByTestId('chart-node-chart')).toHaveTextContent('Wire a list of records or numbers into data');
        await openMenu();
        expect(screen.getByRole('menuitem', {name: 'Configure'})).toBeDisabled();
    });

    it('configures itself from a wired amortization schedule', async () => {
        renderChart({wire: SCHEDULE});
        expect(await screen.findByRole('img', {name: 'Repayment'})).toBeInTheDocument();
        expect(screen.getByTestId('chart-view')).toHaveAttribute('data-chart-kind', 'line');
        expect(screen.getByTestId('chart-summary')).toHaveTextContent('36 rows · auto');
        expect(screen.getByTestId('chart-node-chart')).toHaveTextContent('schedule');
    });

    it('draws a record of numbers as bars', async () => {
        renderChart({wire: COST});
        await waitFor(() => expect(screen.getByTestId('chart-view')).toHaveAttribute('data-chart-kind', 'bar'));
        expect(screen.getByTestId('chart-summary')).toHaveTextContent('2 rows · auto');
    });

    it('draws again after the model changes', async () => {
        const {service} = renderChart({wire: SCHEDULE});
        await waitFor(() => expect(screen.getByTestId('chart-summary')).toHaveTextContent('36 rows'));
        // Input values are edited through an InputNode.
        expect(service.addInputNode('loan')).toBeUndefined();
        expect(service.setInputFieldValue('loan', 'years', '5')).toBeUndefined();
        await waitFor(() => expect(screen.getByTestId('chart-summary')).toHaveTextContent('60 rows'));
    });

    it('shows the error row when the wired path does not exist', async () => {
        renderChart({wire: {source: 'schedule', handle: 'out:missing'}});
        expect(await screen.findByRole('alert')).toHaveTextContent('no schedule.missing');
    });

    it('explains a value it cannot chart', async () => {
        renderChart({wire: {source: 'cost', handle: 'out:interest'}});
        expect(
            await screen.findByText(/Wire a list of records, a list of numbers or a record of numbers/),
        ).toBeVisible();
    });

    it('draws with its own config', async () => {
        renderChart({
            wire: SCHEDULE,
            config: {kind: 'bar', x: 'period', series: ['interest', 'principal'], stacked: true},
        });
        await waitFor(() => expect(screen.getByTestId('chart-view')).toHaveAttribute('data-chart-kind', 'bar'));
        expect(screen.getByTestId('chart-summary')).toHaveTextContent('36 rows');
        expect(screen.getByTestId('chart-summary')).not.toHaveTextContent('auto');
    });
});

describe('ChartNode configuration', () => {
    async function configure() {
        await screen.findByRole('img', {name: 'Repayment'});
        await openMenu();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Configure'}));
        return screen.findByRole('form', {name: 'Chart configuration'});
    }

    it('flips to the config form with the automatic config', async () => {
        renderChart({wire: SCHEDULE});
        const form = await configure();
        expect(within(form).getByText('Configured automatically from the data')).toBeInTheDocument();
        expect(within(form).getByLabelText('Horizontal axis')).toHaveValue('period');
        expect(within(form).getByLabelText('balance')).toBeChecked();
        expect(within(form).getByRole('button', {name: 'Reset to automatic'})).toBeDisabled();
        // The chart side is turned away.
        expect(screen.queryByRole('img', {name: 'Repayment'})).not.toBeInTheDocument();
    });

    it('applies a change at once and reports it as node data', async () => {
        const {onNodesChange} = renderChart({wire: SCHEDULE});
        const form = await configure();
        fireEvent.click(within(form).getByLabelText('Bar'));
        await waitFor(() => expect(screen.getByTestId('chart-view')).toHaveAttribute('data-chart-kind', 'bar'));
        expect(within(form).getByText('Custom configuration')).toBeInTheDocument();
        const replaced = onNodesChange.mock.calls
            .flat(2)
            .filter((change): change is Extract<NodeChange, {type: 'replace'}> => change.type === 'replace');
        expect(replaced.at(-1)?.item.data).toMatchObject({
            label: 'Repayment',
            config: {kind: 'bar', x: 'period', series: ['payment', 'interest', 'principal', 'balance']},
        });
    });

    it('keeps the last series and the series column order', async () => {
        renderChart({wire: SCHEDULE});
        const form = await configure();
        for (const name of ['payment', 'interest', 'principal']) fireEvent.click(within(form).getByLabelText(name));
        expect(within(form).getByLabelText('balance')).toBeDisabled();
        fireEvent.click(within(form).getByLabelText('interest'));
        await waitFor(() => expect(within(form).getByLabelText('balance')).toBeEnabled());
        expect(within(form).getByLabelText('interest')).toBeChecked();
    });

    it('offers stacking for bars and areas of several series', async () => {
        renderChart({wire: SCHEDULE});
        const form = await configure();
        expect(within(form).queryByLabelText('Stack series')).not.toBeInTheDocument();
        fireEvent.click(within(form).getByLabelText('Area'));
        fireEvent.click(await within(form).findByLabelText('Stack series'));
        await waitFor(() => expect(within(form).getByLabelText('Stack series')).toBeChecked());
    });

    it('moves a column used as the horizontal axis out of the series', async () => {
        renderChart({wire: SCHEDULE});
        const form = await configure();
        fireEvent.change(within(form).getByLabelText('Horizontal axis'), {target: {value: 'balance'}});
        await waitFor(() => expect(within(form).queryByLabelText('balance')).not.toBeInTheDocument());
        expect(within(form).getByLabelText('period')).not.toBeChecked();
    });

    it('flips back with Done and returns to the automatic config with Reset', async () => {
        renderChart({wire: SCHEDULE, config: {kind: 'bar', x: 'period', series: ['interest']}});
        const form = await configure();
        fireEvent.click(within(form).getByRole('button', {name: 'Reset to automatic'}));
        await waitFor(() =>
            expect(within(form).getByText('Configured automatically from the data')).toBeInTheDocument(),
        );
        fireEvent.click(within(form).getByRole('button', {name: 'Done'}));
        expect(await screen.findByRole('img', {name: 'Repayment'})).toBeInTheDocument();
        expect(screen.getByTestId('chart-view')).toHaveAttribute('data-chart-kind', 'line');
    });

    it('resets from the node menu', async () => {
        renderChart({wire: SCHEDULE, config: {kind: 'bar', x: 'period', series: ['interest']}});
        await screen.findByRole('img', {name: 'Repayment'});
        await openMenu();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Reset to automatic'}));
        await waitFor(() => expect(screen.getByTestId('chart-view')).toHaveAttribute('data-chart-kind', 'line'));
    });

    it('closes the form with Escape', async () => {
        renderChart({wire: SCHEDULE});
        const form = await configure();
        fireEvent.keyDown(within(form).getByLabelText('Horizontal axis'), {key: 'Escape'});
        expect(await screen.findByRole('img', {name: 'Repayment'})).toBeInTheDocument();
    });
});

describe('ChartNode frame', () => {
    it('has a resize grip in its bottom-right corner', () => {
        renderChart();
        const grip = screen.getByRole('img', {name: 'Resize chart'});
        expect(grip.closest('.react-flow__resize-control')).toHaveClass('bottom', 'right');
    });

    it('offers no menu and no resize grip in read-only mode', async () => {
        renderChart({wire: SCHEDULE, readOnly: true});
        expect(await screen.findByRole('img', {name: 'Repayment'})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Chart actions'})).not.toBeInTheDocument();
        expect(screen.queryByRole('img', {name: 'Resize chart'})).not.toBeInTheDocument();
    });
});
