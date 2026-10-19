import type {Node} from '@xyflow/react';
import type {CoreNodeData, CoreNodeMenuContext, MoveDirection, NodeEditing, RowEditing} from '../core-node';
import type {FlowEditorOpenTarget} from '../flow-editor-types';

/** ReactFlow node data of an InputNode; the node id is the field path. */
export type InputNodeData = CoreNodeData;

export type InputNodeType = Node<InputNodeData, 'inputNode'>;

export interface InputField {
    name: string;
    type: string; // 'number', 'string[]', 'object' for a nested record
    value?: string; // expression text, for example '23' or "'retail'"; undefined for a nested record
    used: boolean; // an expression elsewhere in the model reads it; Delete field is disabled
}

export interface InputNodeModel {
    field: string; // model field path
    label?: string; // '@node-name'
    fields: InputField[]; // one output pin per field of the record
}

/** The row edits of an InputNode: a record field rename or a field value edit. */
export type InputNodeRowEditing = RowEditing<'input-field' | 'input-value'>;

/** The inline edits of an InputNode: the header edits plus the row edit. */
export type InputNodeEditing = NodeEditing<InputNodeRowEditing>;

export interface InputNodeMenuContext extends CoreNodeMenuContext {
    field: string;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
    onAddField: () => void;
}

export interface InputFieldMenuContext {
    model: InputNodeModel;
    item: InputField;
    onMove: (direction: MoveDirection) => void;
    onAddBelow: () => void;
    onDelete: () => void;
}
