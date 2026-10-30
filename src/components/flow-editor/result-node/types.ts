import type {Node} from '@xyflow/react';
import type {CoreNodeMenuContext, FlowEditorOpenTarget, MoveDirection, RowEditing} from '../core-node/types';
import type {CoreNodeData} from '../core-node/types';

/** ReactFlow node data of a ResultNode; the node id is '<service>.return'. */
export type ResultNodeData = CoreNodeData;

export type ResultNodeType = Node<ResultNodeData, 'resultNode'>;

/** One value the service returns: a field of its `return` record. */
export interface ResultField {
    name: string;
    type: string; // from the linked return type; 'any' when the model does not link
    value?: string; // the expression text, for example 'cost.totalInterest'; undefined for a nested record
}

export interface ResultNodeModel {
    field: string; // node id: '<service>.return'
    label?: string; // '@node-name'
    fields: ResultField[]; // one input pin each
    exists: boolean; // false when the service has no `return` record annotated @ResultNode
}

/** The row edits of a ResultNode: a field rename or a field expression edit. */
export type ResultNodeRowEditing = RowEditing<'result-field' | 'result-value'>;

export interface ResultNodeMenuContext extends Pick<
    CoreNodeMenuContext,
    'readOnly' | 'canDescribe' | 'hasDescription' | 'onRenameNode' | 'onAddDescription' | 'onRemoveDescription'
> {
    field: string;
    onRemoveFromFlow: () => void;
    onDelete: () => void;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
}

export interface ResultFieldMenuContext {
    model: ResultNodeModel;
    item: ResultField;
    onMove: (direction: MoveDirection) => void;
    onDelete: () => void;
}
