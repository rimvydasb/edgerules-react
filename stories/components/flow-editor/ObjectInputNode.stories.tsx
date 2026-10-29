import '@xyflow/react/dist/style.css';
import {useEffect, useMemo, useState, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {ReactFlow, ReactFlowProvider, type Edge, type Node} from '@xyflow/react';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {createDocumentationService} from '../../../src/components/documentation-service';
import {
    createFlowEditorService,
    FlowEditorProvider,
    FunctionNode,
    ObjectInputNode,
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

const nodeTypes = {objectInputNode: ObjectInputNode, functionNode: FunctionNode};

function Canvas({
    field,
    wired = false,
    readOnly = false,
    description,
}: {
    field: string;
    wired?: boolean;
    readOnly?: boolean;
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
        {id: field, type: 'objectInputNode', position: {x: 20, y: 40}, data: {field}},
        ...(wired
            ? [{id: 'decision', type: 'functionNode', position: {x: 460, y: 40}, data: {field: 'decision'}}]
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
            <FlowEditorProvider
                service={service}
                documentation={documentation}
                languageService={MutableDecisionService}
                readOnly={readOnly}
            >
                <div style={{width: '100%', height: 420}}>
                    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={false} fitView />
                </div>
            </FlowEditorProvider>
        </ReactFlowProvider>
    );
}

const meta: Meta<typeof Canvas> = {
    title: 'Components/Flow Editor/Object Input Node',
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
/** The record feeds the `decision` FunctionNode: one wire per field. */
export const Wired: Story = {args: {field: 'applicant', wired: true}};
/** Values are shown as code and cannot be edited. */
export const ReadOnly: Story = {args: {field: 'applicant', readOnly: true}};
