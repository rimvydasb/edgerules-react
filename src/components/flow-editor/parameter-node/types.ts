import type {Node} from '@xyflow/react';
import type {CoreNodeData, FlowEditorOpenTarget, NodeEditing} from '../core-node/types';

/** ReactFlow node data of a ParameterNode; the node id is '<service>.<parameter>'. */
export type ParameterNodeData = CoreNodeData;

export type ParameterNodeType = Node<ParameterNodeData, 'parameterNode'>;

/** One field of the record type of a parameter. */
export interface ParameterField {
    name: string;
    type: string; // 'number', 'string[]', 'object' for a nested record
}

export interface ParameterNodeModel {
    field: string; // node id: '<service>.<parameter>'
    name: string; // the parameter name
    type: string; // the declared type text, for example 'LoanRequest', 'number' or 'Installment[]'
    typePath?: string; // the model path of a named record type, for example 'LoanRequest'
    fields: ParameterField[]; // the fields of a record type, one output pin each; empty for any other type
    used: boolean; // the service body reads the parameter; Delete is disabled
    exists: boolean; // false when the service has no such parameter
}

/** The inline edits of a ParameterNode: the name in the title, the type in the summary line, the description. */
export type ParameterNodeEditing = NodeEditing<{kind: 'parameter-type'}>;

export interface ParameterNodeMenuContext {
    model: ParameterNodeModel;
    readOnly: boolean;
    canDescribe: boolean;
    hasDescription: boolean;
    onRename: () => void;
    onChangeType: () => void;
    onAddDescription: () => void;
    onRemoveDescription: () => void;
    onDelete: () => void;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
}
