import type {Node} from '@xyflow/react';
import type {CoreNodeData, CoreNodeMenuContext, FlowEditorOpenTarget} from '../core-node/types';

/** ReactFlow node data of a ListInputNode; the node id is the field path. */
export type ListInputNodeData = CoreNodeData;

export type ListInputNodeType = Node<ListInputNodeData, 'listInputNode'>;

/** One field of the list item: the shape of every element. */
export interface ListItemField {
    name: string;
    type: string; // 'number', 'string', 'object' for a nested record
}

export interface ListInputNodeModel {
    field: string; // model field path
    label?: string; // '@node-name'
    type: string; // the list type, for example 'object[]' or 'number[]'
    itemFields: ListItemField[]; // the fields of a record item; empty for a list of plain values
}

export interface ListInputNodeMenuContext extends CoreNodeMenuContext {
    field: string;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
}
