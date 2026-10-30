import {MutableDecisionService} from '@edgerules/node/mutable';
import {ReactFlow, ReactFlowProvider} from '@xyflow/react';
import {render} from '@testing-library/react';
import {createDocumentationService} from '../../documentation-service';
import {FlowEditorProvider} from '../FlowEditorProvider';
import type {DocumentationService} from '../../documentation-service';
import {ExpressionNode} from '../expression-node/ExpressionNode';
import type {FlowEditorOpenTarget, FlowEditorService} from '../flow-editor-types';
import {FunctionNode} from '../function-node/FunctionNode';
import {ListInputNode} from '../list-input-node/ListInputNode';
import {ObjectInputNode} from '../object-input-node/ObjectInputNode';
import {ParameterNode} from '../parameter-node/ParameterNode';
import {ReturnNode} from '../return-node/ReturnNode';
import {createFlowEditorService, type FlowEditorEngine} from '../service/createFlowEditorService';
import {ValueInputNode} from '../value-input-node/ValueInputNode';
import {SAMPLE_MODEL} from './sampleModel';

const nodeTypes = {
    functionNode: FunctionNode,
    objectInputNode: ObjectInputNode,
    listInputNode: ListInputNode,
    valueInputNode: ValueInputNode,
    parameterNode: ParameterNode,
    returnNode: ReturnNode,
    expressionNode: ExpressionNode,
};
const INPUT_TYPES = {object: 'objectInputNode', list: 'listInputNode', value: 'valueInputNode'} as const;
const SERVICE_TYPES = {parameter: 'parameterNode', return: 'returnNode'} as const;

export interface RenderedNode {
    service: FlowEditorService;
    documentation: DocumentationService;
    mutable: FlowEditorEngine;
    field: string;
}

export function renderNode(
    field: string,
    options: {
        model?: string;
        draft?: boolean;
        input?: 'object' | 'list' | 'value'; // render an input node; the record, list or value at `field` is annotated first
        service?: 'parameter' | 'return'; // render a node of the service flow of `root`
        expression?: boolean; // render the expression at `field`
        root?: string; // the flow root of the service; defaults to '*'
        readOnly?: boolean;
        onOpenNode?: (target: FlowEditorOpenTarget) => void;
    } = {},
): RenderedNode {
    const mutable = MutableDecisionService.fromCode(options.model ?? SAMPLE_MODEL);
    const service = createFlowEditorService(mutable, {root: options.root});
    const documentation = createDocumentationService(`fn-${Math.random()}`);
    if (options.input) service.addInputNode(field);
    const nodeField = options.draft ? service.createDraftNode() : field;
    render(
        <ReactFlowProvider>
            <FlowEditorProvider
                service={service}
                documentation={documentation}
                languageService={MutableDecisionService}
                readOnly={options.readOnly}
                onOpenNode={options.onOpenNode}
            >
                <div style={{width: 800, height: 600}}>
                    <ReactFlow
                        nodes={[
                            {
                                id: nodeField,
                                type: options.expression
                                    ? 'expressionNode'
                                    : options.service
                                      ? SERVICE_TYPES[options.service]
                                      : options.input
                                        ? INPUT_TYPES[options.input]
                                        : 'functionNode',
                                position: {x: 0, y: 0},
                                data: {field: nodeField},
                                width: 400,
                                height: 300,
                            },
                        ]}
                        edges={[]}
                        nodeTypes={nodeTypes}
                    />
                </div>
            </FlowEditorProvider>
        </ReactFlowProvider>,
    );
    return {service, documentation, mutable, field: nodeField};
}
