import '@xyflow/react/dist/style.css';
import {useEffect, useMemo, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, waitFor, within} from 'storybook/test';
import {
    ReactFlow,
    ReactFlowProvider,
    useNodesInitialized,
    useNodesState,
    useReactFlow,
    type Edge,
    type Node,
} from '@xyflow/react';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {
    createFlowEditorService,
    FlowEditorProvider,
    FunctionNode,
    OutputNode,
} from '../../../src/components/flow-editor';

// The sample model of the FunctionNode design proposal.
const SAMPLE_MODEL = `{
  applicant: { age: 23; income: 25000; segment: "retail" }
  application: { amount: 32000 }
  ruleset risk(age: number, income: number, segment: string): {
    hitPolicy: "first-match"
    rules: [
      { when: { age: 18..25, income: < 30000, segment: "retail" }, then: { level: "high", limit: 1000 } }
      { when: { age: >= 26 }, then: { level: "medium", limit: 5000 } }
    ]
    default: { level: "none", limit: 0 }
  }
  func monthly(amount: number): amount / 12
  decision: risk(age: applicant.age, income: applicant.income, segment: applicant.segment)
  payment: monthly(amount: application.amount * 1.1)
}`;

// One function whose result has a field of every value shape that an OutputNode draws.
const KINDS_MODEL = `{
  type Offer: { tier: <string>; rate: <number>; approved: <boolean> }
  func showcase(seed: number): {
    amount: seed * 1250.5
    label: "approved"
    approved: true
    dueDate: date("2026-11-01")
    scores: [seed, seed * 2, seed * 3, 5, 8]
    tags: ["retail", "prime", "new"]
    applicant: { name: "Ada"; age: 37; vip: false }
    nested: { pricing: { tier: "prime"; premium: 0.005 }; history: [1, 2, 3, 4, 5, 6, 7] }
    offers: [
      { tier: "prime"; rate: 0.04; approved: true }
      { tier: "standard"; rate: 0.055; approved: true }
      { tier: "near-prime"; rate: 0.07; approved: false }
    ]
    schedule: amortizationSchedule(12000, 0.05 / 12, 12)
    noOffers: <Offer[], []>
  }
  samples: showcase(seed: 2)
}`;

// The outputs of the kinds story in columns: [result field, title].
const KIND_COLUMNS: [string, string][][] = [
    [
        ['amount', 'Number'],
        ['label', 'Text'],
        ['approved', 'Boolean'],
        ['dueDate', 'Date'],
    ],
    [
        ['scores', 'List of numbers'],
        ['tags', 'List of text'],
    ],
    [
        ['applicant', 'Record'],
        ['nested', 'Record with nested values'],
    ],
    [
        ['offers', 'List of records'],
        ['schedule', 'Amortization schedule'],
        ['noOffers', 'Empty list of records'],
    ],
];

const nodeTypes = {functionNode: FunctionNode, outputNode: OutputNode};

function Canvas({
    source,
    handle,
    label,
}: {
    source: string; // the FunctionNode field next to the output
    handle?: string; // the result pin wired into the output; no wire when absent
    label?: string;
}): ReactElement {
    const service = useMemo(() => createFlowEditorService(MutableDecisionService.fromCode(SAMPLE_MODEL) as never), []);
    const nodes: Node[] = [
        {id: source, type: 'functionNode', position: {x: 20, y: 40}, data: {field: source}},
        {id: 'output', type: 'outputNode', position: {x: 520, y: 80}, data: {label}},
    ];
    const edges: Edge[] = handle
        ? [{id: 'result', source, sourceHandle: handle, target: 'output', targetHandle: 'in:value'}]
        : [];

    return (
        <ReactFlowProvider>
            <FlowEditorProvider service={service}>
                <div style={{width: '100%', height: 420}}>
                    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={false} fitView />
                </div>
            </FlowEditorProvider>
        </ReactFlowProvider>
    );
}

// The kinds story's canvas: the function on the left, its outputs in columns on the right.
const KIND_OUTPUTS = KIND_COLUMNS.flatMap((column, x) =>
    column.map(([field, label], y) => ({field, label, position: {x: 1100 + x * 480, y: y * (x === 0 ? 120 : 640)}})),
);
const KIND_NODES: Node[] = [
    {id: 'samples', type: 'functionNode', position: {x: 0, y: 0}, data: {field: 'samples'}},
    ...KIND_OUTPUTS.map(({field, label, position}) => ({
        id: `output-${field}`,
        type: 'outputNode',
        position,
        data: {label},
    })),
];
const KIND_EDGES: Edge[] = KIND_OUTPUTS.map(({field}) => ({
    id: field,
    source: 'samples',
    sourceHandle: `out:${field}`,
    target: `output-${field}`,
    targetHandle: 'in:value',
}));

// xyflow fits the first nodes it measures; this fits again once it has measured them all.
function FitWhenMeasured(): null {
    const measured = useNodesInitialized();
    const {fitView} = useReactFlow();
    useEffect(() => {
        if (measured) void fitView();
    }, [measured, fitView]);
    return null;
}

function KindsCanvas(): ReactElement {
    const service = useMemo(() => createFlowEditorService(MutableDecisionService.fromCode(KINDS_MODEL) as never), []);
    // Controlled nodes keep what xyflow measures, so the first fit sees the size of every node.
    const [nodes, , onNodesChange] = useNodesState(KIND_NODES);

    return (
        <ReactFlowProvider>
            <FlowEditorProvider service={service}>
                <div style={{width: '100%', height: '100vh'}}>
                    <ReactFlow
                        nodes={nodes}
                        edges={KIND_EDGES}
                        onNodesChange={onNodesChange}
                        nodeTypes={nodeTypes}
                        fitView
                        minZoom={0.2}
                    >
                        <FitWhenMeasured />
                    </ReactFlow>
                </div>
            </FlowEditorProvider>
        </ReactFlowProvider>
    );
}

const meta: Meta<typeof Canvas> = {
    title: 'Components/Flow Editor/Output Node',
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

// xyflow hides a node until it is measured, so the first lookup waits longer than the default.
const SLOW = {timeout: 8000};

/** Nothing is wired: the node shows a dash. */
export const Unwired: Story = {args: {source: 'decision'}};

/** One field of a record result: `decision.level`. */
export const Wired: Story = {
    args: {source: 'decision', handle: 'out:level'},
    play: async ({canvasElement}) => {
        const value = await within(canvasElement).findByTestId('output-value', {}, SLOW);
        await expect(await within(value).findByText("'high'", {}, SLOW)).toBeVisible();
    },
};

/** The whole result of a function with an unnamed return. */
export const UnnamedResult: Story = {args: {source: 'payment', handle: 'out:result', label: 'Monthly payment'}};

/** The wired path is not in the model: the node shows the error row. */
export const MissingPath: Story = {args: {source: 'decision', handle: 'out:missing'}};

/**
 * Every value shape side by side: a single value shows in the value row; a list, a list of records and a record show
 * as a table under it. A table shows at most 10 rows and 5 value columns and ends with a `…` row or column; an empty
 * list of records shows the columns of its type and an Empty row.
 */
export const Kinds: Story = {
    render: () => <KindsCanvas />,
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        const expectShape = (field: string, shape: string) =>
            waitFor(
                () => expect(canvas.getByTestId(`output-node-output-${field}`)).toHaveAttribute('data-shape', shape),
                SLOW,
            );
        for (const field of ['amount', 'label', 'approved', 'dueDate']) await expectShape(field, 'scalar');
        await expectShape('scores', 'list');
        await expectShape('applicant', 'record');
        await expectShape('offers', 'table');
        await expectShape('schedule', 'table');
        await expect(canvas.getByText('12 rows × 5 columns')).toBeVisible();
        await expect(
            within(canvas.getByTestId('output-node-output-schedule')).getByTestId('output-more-rows'),
        ).toBeVisible();
        await expectShape('noOffers', 'table');
        await expect(within(canvas.getByTestId('output-node-output-noOffers')).getByText('Empty')).toBeVisible();
    },
};
