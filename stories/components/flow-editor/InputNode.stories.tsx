import '@xyflow/react/dist/style.css';
import {useEffect, useMemo, useState, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, userEvent, within} from 'storybook/test';
import {ReactFlow, ReactFlowProvider, type Edge, type Node} from '@xyflow/react';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {createDocumentationService} from '../../../src/components/documentation-service';
import {
    createFlowEditorService,
    FlowEditorProvider,
    FunctionNode,
    InputNode,
} from '../../../src/components/flow-editor';

// The sample model of the FunctionNode design proposal.
const SAMPLE_MODEL = `{
  type Applicant: { age: <number>; income: <number>; segment: <string> }
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
  decision: risk(age: applicant.age, income: applicant.income, segment: applicant.segment)
}`;

const nodeTypes = {inputNode: InputNode, functionNode: FunctionNode};

function Canvas({
    field,
    wired = false,
    description,
}: {
    field: string;
    wired?: boolean;
    description?: string;
}): ReactElement {
    const service = useMemo(() => {
        const created = createFlowEditorService(MutableDecisionService.fromCode(SAMPLE_MODEL) as never);
        created.addInputNode(field);
        if (wired) created.setCallee('decision', 'risk'); // writes the same invocation with @node: FunctionNode, keeping its bindings
        return created;
    }, [field, wired]);
    const documentation = useMemo(() => {
        const created = createDocumentationService(`input-story-${Math.random()}`);
        if (description) created.setDescription(field, description);
        return created;
        // The description only seeds the service.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const nodes: Node[] = [
        {id: field, type: 'inputNode', position: {x: 20, y: 40}, data: {field}},
        ...(wired
            ? [{id: 'decision', type: 'functionNode', position: {x: 360, y: 40}, data: {field: 'decision'}}]
            : []),
    ];
    // The wires are the path bindings of `decision`, read again after every change of the model.
    const [edges, setEdges] = useState<Edge[]>([]);
    useEffect(() => {
        if (!wired) return;
        const read = () => {
            const next = service.getFunctionNode('decision').arguments.flatMap((argument) => {
                const [source, name] = argument.binding?.text.split('.') ?? [];
                return argument.binding?.kind === 'path' && source === field && name
                    ? [
                          {
                              id: `${argument.binding.text}->${argument.name}`,
                              source: field,
                              sourceHandle: `out:${name}`,
                              target: 'decision',
                              targetHandle: `in:${argument.name}`,
                          },
                      ]
                    : [];
            });
            // Keep the same array while the wires are unchanged, as a host canvas would: a new array makes
            // xyflow recompute the wire ends and would hide a node that does not report its moved pins.
            setEdges((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
        };
        read();
        return service.subscribe(read);
    }, [service, wired, field]);

    return (
        <ReactFlowProvider>
            <FlowEditorProvider service={service} documentation={documentation}>
                <div style={{width: '100%', height: 420}}>
                    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={false} fitView />
                </div>
            </FlowEditorProvider>
        </ReactFlowProvider>
    );
}

const meta: Meta<typeof Canvas> = {
    title: 'Components/Flow Editor/InputNode',
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

export const Default: Story = {args: {field: 'applicant'}};
export const SingleField: Story = {args: {field: 'application'}};
/** The record feeds the `decision` FunctionNode: one wire per field. */
export const Wired: Story = {args: {field: 'applicant', wired: true}};

const DESCRIPTION = 'The person who applies for the credit';

// Menus render in a portal, so the play functions query the whole document.
const screen = () => within(document.body);
// xyflow hides a node until it is measured, so the first lookup waits longer than the default.
const SLOW = {timeout: 8000};

export const NodeMenu: Story = {
    args: {field: 'applicant', description: DESCRIPTION},
    play: async () => {
        await userEvent.click(await screen().findByRole('button', {name: 'Node actions'}, SLOW));
        await expect(await screen().findByRole('menuitem', {name: 'Duplicate'})).toBeVisible();
    },
};

export const RenameField: Story = {
    args: {field: 'applicant'},
    play: async () => {
        await userEvent.click(await screen().findByRole('button', {name: 'age'}, SLOW));
        const input = await screen().findByLabelText('Rename field age');
        await userEvent.clear(input);
        await userEvent.type(input, 'years');
    },
};
