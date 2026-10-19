import '@xyflow/react/dist/style.css';
import {useMemo, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, userEvent, within} from 'storybook/test';
import {ReactFlow, ReactFlowProvider, type Edge, type Node} from '@xyflow/react';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {
    ChartNode,
    createFlowEditorService,
    FlowEditor,
    FlowEditorProvider,
    FunctionNode,
    type ChartConfig,
    type FlowLayout,
} from '../../../src/components/flow-editor';

// A loan repayment model: the monthly amortization schedule (a list of records) and the cost split of the loan
// (a record of numbers).
const LOAN_MODEL = `{
  loan: { amount: 25000; annualRate: 0.06; years: 3 }
  func repayment(amount: number, annualRate: number, years: number): amortizationSchedule(amount, annualRate / 12, years * 12)
  func loanCost(amount: number, annualRate: number, years: number): {
    principal: amount
    interest: sum(for installment in repayment(amount, annualRate, years) return installment.interest)
  }
  schedule: repayment(amount: loan.amount, annualRate: loan.annualRate, years: loan.years)
  cost: loanCost(amount: loan.amount, annualRate: loan.annualRate, years: loan.years)
}`;

function loanService() {
    const service = createFlowEditorService(MutableDecisionService.fromCode(LOAN_MODEL) as never);
    service.addInputNode('loan');
    // Writes the same invocations with @node: FunctionNode, keeping their bindings.
    service.setCallee('schedule', 'repayment');
    service.setCallee('cost', 'loanCost');
    return service;
}

const BALANCE: ChartConfig = {kind: 'area', x: 'period', series: ['balance']};
const PAYMENT_SPLIT: ChartConfig = {kind: 'bar', x: 'period', series: ['interest', 'principal'], stacked: true};

const LOAN_LAYOUT: FlowLayout = {
    positions: {},
    outputs: [],
    charts: [
        {
            id: 'chart',
            label: 'Remaining balance',
            source: {node: 'schedule', handle: 'out:result'},
            config: BALANCE,
            size: {width: 520, height: 340},
        },
        {
            id: 'chart2',
            label: 'Monthly payment split',
            source: {node: 'schedule', handle: 'out:result'},
            config: PAYMENT_SPLIT,
            size: {width: 520, height: 340},
        },
        {
            id: 'chart3',
            label: 'Cost of the loan',
            source: {node: 'cost', handle: 'out:*'},
            size: {width: 360, height: 300},
        },
    ],
};

/** The whole loan flow: edit the loan input and every chart draws again. */
function LoanFlow(): ReactElement {
    const service = useMemo(loanService, []);
    return (
        <div style={{height: '100vh'}}>
            <FlowEditor service={service} languageService={MutableDecisionService} defaultLayout={LOAN_LAYOUT} />
        </div>
    );
}

const nodeTypes = {functionNode: FunctionNode, chartNode: ChartNode};

/** One ChartNode next to the schedule node it reads. */
function Canvas({
    wired = true,
    label,
    config,
}: {
    wired?: boolean; // the schedule result is wired into the chart
    label?: string;
    config?: ChartConfig; // undefined: configured automatically
}): ReactElement {
    const service = useMemo(loanService, []);
    const nodes: Node[] = [
        {id: 'schedule', type: 'functionNode', position: {x: 20, y: 60}, data: {field: 'schedule'}},
        {
            id: 'chart',
            type: 'chartNode',
            position: {x: 500, y: 20},
            data: {label, config},
            width: 520,
            height: 360,
        },
    ];
    const edges: Edge[] = wired
        ? [{id: 'chart:data', source: 'schedule', sourceHandle: 'out:result', target: 'chart', targetHandle: 'in:data'}]
        : [];
    return (
        <ReactFlowProvider>
            <FlowEditorProvider service={service}>
                <div style={{width: '100%', height: 480}}>
                    <ReactFlow defaultNodes={nodes} defaultEdges={edges} nodeTypes={nodeTypes} fitView />
                </div>
            </FlowEditorProvider>
        </ReactFlowProvider>
    );
}

const meta: Meta<typeof Canvas> = {
    title: 'Flow Editor/ChartNode',
    component: Canvas,
    parameters: {layout: 'fullscreen'},
    loaders: [
        async () => {
            await init();
            return {};
        },
    ],
};
export default meta;

type Story = StoryObj<typeof Canvas>;

// xyflow hides a node until it is measured, and the engine loads first: the first lookup waits longer.
const SLOW = {timeout: 8000};

/**
 * Loan repayment in the Flow Editor: the loan input feeds the amortization schedule and the cost split, and three
 * charts read them. Change the amount, rate or years on the input node and every chart draws again. Drag the
 * bottom-right corner of a chart to resize it.
 */
export const LoanRepayment: Story = {render: () => <LoanFlow />};

/** No config: the node picks `period` for the axis and draws every other numeric column as a line. */
export const AutoConfigured: Story = {
    args: {label: 'Repayment schedule'},
    play: async ({canvasElement}) => {
        const chart = await within(canvasElement).findByRole('img', {name: 'Repayment schedule'}, SLOW);
        await expect(chart).toBeVisible();
    },
};

/** Its own config: interest and principal of every installment as stacked bars. */
export const PaymentSplit: Story = {args: {label: 'Monthly payment split', config: PAYMENT_SPLIT}};

/** Configure flips the node to the form TanStack Charts needs; changes apply at once. */
export const Configure: Story = {
    args: {label: 'Repayment schedule'},
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        await canvas.findByRole('img', {name: 'Repayment schedule'}, SLOW);
        await userEvent.click(canvas.getByRole('button', {name: 'Chart actions'}));
        await userEvent.click(await within(document.body).findByRole('menuitem', {name: 'Configure'}));
        await expect(await canvas.findByRole('form', {name: 'Chart configuration'})).toBeVisible();
    },
};

/** Nothing is wired: the node asks for data. */
export const Unwired: Story = {args: {wired: false}};
