import {MutableDecisionService} from '@edgerules/node/mutable';
import {ReactFlow, ReactFlowProvider} from '@xyflow/react';
import {render} from '@testing-library/react';
import {createDocumentationService} from '../../documentation-service';
import {FlowEditorProvider} from '../FlowEditorProvider';
import type {DocumentationService} from '../../documentation-service';
import type {FlowEditorOpenTarget, FlowEditorService} from '../flow-editor-types';
import {FunctionNode} from '../function-node/FunctionNode';
import {createFlowEditorService, type FlowEditorEngine} from '../service/createFlowEditorService';
import {SAMPLE_MODEL} from './sampleModel';

const nodeTypes = {functionNode: FunctionNode};

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
        readOnly?: boolean;
        onOpenNode?: (target: FlowEditorOpenTarget) => void;
    } = {},
): RenderedNode {
    const mutable = MutableDecisionService.fromCode(options.model ?? SAMPLE_MODEL);
    const service = createFlowEditorService(mutable);
    const documentation = createDocumentationService(`fn-${Math.random()}`);
    const nodeField = options.draft ? service.createDraftNode() : field;
    render(
        <ReactFlowProvider>
            <FlowEditorProvider
                service={service}
                documentation={documentation}
                readOnly={options.readOnly}
                onOpenNode={options.onOpenNode}
            >
                <div style={{width: 800, height: 600}}>
                    <ReactFlow
                        nodes={[
                            {
                                id: nodeField,
                                type: 'functionNode',
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
