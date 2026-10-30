import type {Node} from '@xyflow/react';
import type {CoreNodeData, CoreNodeMenuContext, FlowEditorOpenTarget, NodeEditing} from '../core-node/types';

/** ReactFlow node data of an ExpressionNode; the node id is the field path. */
export type ExpressionNodeData = CoreNodeData;

export type ExpressionNodeType = Node<ExpressionNodeData, 'expressionNode'>;

export interface ExpressionNodeModel {
    field: string; // model field path
    type: string; // the linked result type, for example 'number'; 'any' when the engine infers none
    expression?: string; // the expression text, for example 'amount * rate'; undefined when the field does not exist
    variables: string[]; // the field paths the expression reads, as written: '@variables' of the engine
}

/** The inline edits of an ExpressionNode: the field name and the description. */
export type ExpressionNodeEditing = NodeEditing;

export type ExpressionNodeMenuContext = Pick<
    CoreNodeMenuContext,
    | 'readOnly'
    | 'canDescribe'
    | 'hasDescription'
    | 'onRenameField'
    | 'onDuplicate'
    | 'onAddDescription'
    | 'onRemoveDescription'
    | 'onDelete'
> & {
    field: string;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
};
