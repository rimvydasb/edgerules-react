import '@xyflow/react/dist/style.css';
import {useCallback, useEffect, useMemo, useState, type ReactElement} from 'react';
import {Box, Text} from '@mantine/core';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {
    Handle,
    Position,
    ReactFlow,
    ReactFlowProvider,
    type Connection,
    type Edge,
    type Node,
    type NodeProps,
} from '@xyflow/react';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {createDocumentationService} from '../../../src/components/documentation-service';
import {
    createFlowEditorService,
    FlowEditorProvider,
    FunctionNode,
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

/** Story-local stand-in for an InputNode: one source pin per field of `applicant`. */
function SourceStub({data}: NodeProps<Node<{title: string; fields: string[]}>>): ReactElement {
    return (
        <Box w={200} bd="1px solid var(--mantine-color-default-border)" bg="var(--mantine-color-body)">
            <Box px="sm" h={40} bg="var(--mantine-color-default-hover)" style={{display: 'flex', alignItems: 'center'}}>
                <Text fw={600} size="sm">
                    {data.title}
                </Text>
            </Box>
            {data.fields.map((field) => (
                <Box
                    key={field}
                    px="sm"
                    h={40}
                    pos="relative"
                    style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end'}}
                    bd="0 solid"
                >
                    <Text size="sm">{field}</Text>
                    <Handle type="source" position={Position.Right} id={`out:${field}`} />
                </Box>
            ))}
        </Box>
    );
}

/** Story-local stand-in for an OutputNode: shows a value computed by the engine. */
function OutputStub({data}: NodeProps<Node<{title: string; value: string}>>): ReactElement {
    return (
        <Box w={200} bd="1px solid var(--mantine-color-default-border)" bg="var(--mantine-color-body)">
            <Box
                px="sm"
                h={40}
                pos="relative"
                bg="var(--mantine-color-default-hover)"
                style={{display: 'flex', alignItems: 'center'}}
            >
                <Handle type="target" position={Position.Left} id="in:value" />
                <Text fw={600} size="sm">
                    {data.title}
                </Text>
            </Box>
            <Box px="sm" h={40} style={{display: 'flex', alignItems: 'center'}}>
                <Text ff="monospace" size="sm" data-testid="output-value">
                    {data.value}
                </Text>
            </Box>
        </Box>
    );
}

const nodeTypes = {functionNode: FunctionNode, sourceStub: SourceStub, outputStub: OutputStub};

interface Built {
    service: FlowEditorService;
    mutable: InstanceType<typeof MutableDecisionService>;
    field: string;
}

function build(field: string | null, partial: boolean): Built {
    const mutable = MutableDecisionService.fromCode(SAMPLE_MODEL);
    const service = createFlowEditorService(mutable as never);
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
}: {
    field: string | null;
    wired?: boolean;
    partial?: boolean;
}): ReactElement {
    const {service, mutable, field: nodeField} = useMemo(() => build(field, partial), [field, partial]);
    const documentation = useMemo(() => createDocumentationService(`flow-story-${Math.random()}`), []);
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
    const [outputValue, setOutputValue] = useState('…');

    useEffect(() => {
        if (!wired) return;
        const refresh = () => {
            mutable
                .execute(nodeField)
                .then((result) => setOutputValue(JSON.stringify((result as Record<string, unknown>).level)))
                .catch(() => setOutputValue('error'));
        };
        refresh();
        return service.subscribe(refresh);
    }, [wired, mutable, nodeField, service]);

    const nodes: Node[] = [
        {id: nodeField, type: 'functionNode', position: {x: 320, y: 40}, data: {field: nodeField}},
        ...(wired
            ? [
                  {
                      id: 'applicant',
                      type: 'sourceStub',
                      position: {x: 20, y: 60},
                      data: {title: 'Applicant', fields: ['age', 'income', 'segment']},
                  },
                  {
                      id: 'output',
                      type: 'outputStub',
                      position: {x: 760, y: 80},
                      data: {title: 'Output', value: outputValue},
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
    title: 'Components/Flow Editor/FunctionNode',
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
/** A new node with a callee picked and no argument bound yet. */
export const Draft: Story = {args: {field: null, partial: true}};
export const NoCallee: Story = {args: {field: null}};
export const Wired: Story = {args: {field: 'decision', wired: true}};
