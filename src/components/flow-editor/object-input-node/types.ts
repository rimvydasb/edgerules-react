import type {Node} from '@xyflow/react';
import type {
    CoreNodeData,
    CoreNodeMenuContext,
    FlowEditorOpenTarget,
    MoveDirection,
    NodeEditing,
    RowEditing,
} from '../core-node/types';

/** ReactFlow node data of an ObjectInputNode; the node id is the field path. */
export type ObjectInputNodeData = CoreNodeData;

export type ObjectInputNodeType = Node<ObjectInputNodeData, 'objectInputNode'>;

/** A declaration inside the record: it defines something callable or a type, so it has no value and no output pin. */
export type InputDeclarationKind = 'function' | 'ruleset' | 'optimisation' | 'type';

export interface ObjectInputField {
    name: string;
    type: string; // 'number', 'string[]', 'object' for a nested record
    value?: string; // expression text, for example '23' or "'retail'"; undefined for a nested record
    declaration?: InputDeclarationKind; // set for a function, ruleset, optimisation or type declaration
    used: boolean; // an expression elsewhere in the model reads it; Delete field is disabled
}

export interface ObjectInputNodeModel {
    field: string; // model field path
    label?: string; // '@node-name'
    fields: ObjectInputField[]; // one output pin per field of the record
}

/** The row edits of an ObjectInputNode: a record field rename or a field value edit. */
export type ObjectInputNodeRowEditing = RowEditing<'input-field' | 'input-value'>;

/** The inline edits of an ObjectInputNode: the header edits plus the row edit. */
export type ObjectInputNodeEditing = NodeEditing<ObjectInputNodeRowEditing>;

export interface ObjectInputNodeMenuContext extends CoreNodeMenuContext {
    field: string;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
    onAddField: () => void;
}

export interface ObjectInputFieldMenuContext {
    model: ObjectInputNodeModel;
    item: ObjectInputField;
    onMove: (direction: MoveDirection) => void;
    onAddBelow: () => void;
    onDelete: () => void;
}
