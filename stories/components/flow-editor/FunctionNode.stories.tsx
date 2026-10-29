import '@xyflow/react/dist/style.css';
import {useCallback, useMemo, useState, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {ReactFlow, ReactFlowProvider, type Connection, type Edge, type Node} from '@xyflow/react';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {createDocumentationService} from '../../../src/components/documentation-service';
import {
    createFlowEditorService,
    FlowEditorProvider,
    FunctionNode,
    InputNode,
    OutputNode,
    type FlowEditorService,
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
  func creditScore(age: number, income: number): 300 + age * 2 + income / 1000
  func monthly(amount: number): amount / 12
  func applicantDecision(person: Applicant): { eligible: person.age >= 18; reason: if person.age >= 18 then "adult" else "minor" }
  decision: risk(age: applicant.age, income: applicant.income, segment: applicant.segment)
  score: creditScore(age: applicant.age, income: applicant.income)
  payment: monthly(amount: application.amount * 1.1)
  eligibility: applicantDecision(person: applicant)
}`;

const nodeTypes = {functionNode: FunctionNode, inputNode: InputNode, outputNode: OutputNode};

interface Built {
    service: FlowEditorService;
    mutable: InstanceType<typeof MutableDecisionService>;
    field: string;
}

function build(field: string | null, partial: boolean, wired: boolean): Built {
    const mutable = MutableDecisionService.fromCode(SAMPLE_MODEL);
    const service = createFlowEditorService(mutable as never);
    if (wired) service.addInputNode('applicant');
    const nodeField = field ?? service.createDraftNode();
    if (partial) {
        // A draft: a callee and one of three arguments; nothing is written to the model.
        service.setCallee(nodeField, 'risk');
        service.bindArgument(nodeField, 'age', 'applicant.age');
    }
    return {service, mutable, field: nodeField};
}

function Canvas({
    field,
    wired = false,
    partial = false,
    description,
}: {
    field: string | null;
    wired?: boolean;
    partial?: boolean;
    description?: string;
}): ReactElement {
    const {service, field: nodeField} = useMemo(() => build(field, partial, wired), [field, partial, wired]);
    const documentation = useMemo(() => {
        const service = createDocumentationService(`flow-story-${Math.random()}`);
        if (description) service.setDescription(nodeField, description);
        return service;
        // The description only seeds the service.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [edges, setEdges] = useState<Edge[]>(() => {
        if (!wired) return [];
        const model = service.getFunctionNode(nodeField);
        return model.arguments
            .flatMap((argument) =>
                argument.binding?.kind === 'path'
                    ? [
                          {
                              id: `${argument.binding.text}->${argument.name}`,
                              source: 'applicant',
                              sourceHandle: `out:${argument.binding.text.split('.')[1]}`,
                              target: nodeField,
                              targetHandle: `in:${argument.name}`,
                          },
                      ]
                    : [],
            )
            .concat({
                id: 'result',
                source: nodeField,
                sourceHandle: 'out:level',
                target: 'output',
                targetHandle: 'in:value',
            });
    });
    const nodes: Node[] = [
        {id: nodeField, type: 'functionNode', position: {x: 460, y: 40}, data: {field: nodeField}},
        ...(wired
            ? [
                  {
                      id: 'applicant',
                      type: 'inputNode',
                      position: {x: 20, y: 60},
                      data: {field: 'applicant'},
                  },
                  {
                      id: 'output',
                      type: 'outputNode',
                      position: {x: 960, y: 80},
                      data: {},
                  },
              ]
            : []),
    ];

    const onConnect = useCallback(
        (connection: Connection) => {
            if (connection.target !== nodeField || !connection.targetHandle?.startsWith('in:')) return;
            const parameter = connection.targetHandle.slice(3);
            const path = `${connection.source}.${connection.sourceHandle?.slice(4)}`;
            const error = service.bindArgument(nodeField, parameter, path);
            if (error) return;
            setEdges((current) => [
                ...current.filter((edge) => edge.targetHandle !== connection.targetHandle),
                {id: `${path}->${parameter}`, ...connection},
            ]);
        },
        [service, nodeField],
    );

    return (
        <ReactFlowProvider>
            <FlowEditorProvider service={service} documentation={documentation}>
                <div style={{width: '100%', height: 480}}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        onConnect={onConnect}
                        nodesDraggable={false}
                        fitView
                    />
                </div>
            </FlowEditorProvider>
        </ReactFlowProvider>
    );
}

const meta: Meta<typeof Canvas> = {
    title: 'Components/Flow Editor/Function Node',
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

export const Default: Story = {args: {field: 'decision'}};
export const UnnamedReturn: Story = {args: {field: 'payment'}};
export const RecordArgument: Story = {args: {field: 'eligibility'}};
export const NoCallee: Story = {args: {field: null}};
export const Wired: Story = {args: {field: 'decision', wired: true}};
/** A draft next to the InputNode: wire the two open arguments to complete it. */
export const WiredDraft: Story = {args: {field: null, partial: true, wired: true}};
