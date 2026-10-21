import '@xyflow/react/dist/style.css';
import {useMemo, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, within} from 'storybook/test';
import {ReactFlow, ReactFlowProvider, type Edge, type Node} from '@xyflow/react';
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

const meta: Meta<typeof Canvas> = {
    title: 'Flow Editor/OutputNode',
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
