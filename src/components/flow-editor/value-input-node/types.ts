import type {Node} from '@xyflow/react';
import type {CoreNodeData, CoreNodeMenuContext, FlowEditorOpenTarget, RowEditing} from '../core-node/types';

/** ReactFlow node data of a ValueInputNode; the node id is the field path. */
export type ValueInputNodeData = CoreNodeData;

export type ValueInputNodeType = Node<ValueInputNodeData, 'valueInputNode'>;

export interface ValueInputNodeModel {
    field: string; // model field path
    label?: string; // '@node-name'
    type: string; // the value type, for example 'number' or 'string'
    value?: string; // expression text, for example '23' or "'retail'"; undefined when the field does not exist
}

/** The row edit of a ValueInputNode: the value edit. `name` is the field path. */
export type ValueInputNodeRowEditing = RowEditing<'input-value'>;

export interface ValueInputNodeMenuContext extends CoreNodeMenuContext {
    field: string;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
}
