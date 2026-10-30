import type {Node} from '@xyflow/react';
import type {CoreNodeMenuContext, FlowEditorOpenTarget, MoveDirection, RowEditing} from '../core-node/types';
import type {CoreNodeData} from '../core-node/types';

/** ReactFlow node data of a ReturnNode; the node id is '<service>.return'. */
export type ReturnNodeData = CoreNodeData;

export type ReturnNodeType = Node<ReturnNodeData, 'returnNode'>;

/** One value the service returns: a field of its `return` context. */
export interface ReturnField {
    name: string;
    type: string; // from the linked return type; 'any' when the model does not link
    value?: string; // the expression text, for example 'cost.totalInterest'; undefined for a nested record
}

/**
 * The `return` field of a service: a context, whose fields are the values the service returns, or an expression, whose
 * value the service returns.
 */
export interface ReturnNodeModel {
    field: string; // node id: '<service>.return'
    label?: string; // '@node-name' of its `@ReturnNode` annotation
    fields: ReturnField[]; // a context: one input pin each; empty for an expression
    expression?: string; // an expression: its text, for example 'score > 350'; undefined for a context
    type?: string; // an expression: the linked return type; 'any' when the model does not link
    variables: string[]; // an expression: the field paths it reads, as written; they wire into its one input pin
    exists: boolean; // false when the service has no `return` field
}

/** The row edits of a ReturnNode: a field rename or a field expression edit, or the edit of a returned expression. */
export type ReturnNodeRowEditing = RowEditing<'return-field' | 'return-value' | 'return-expression'>;

export interface ReturnNodeMenuContext extends Pick<
    CoreNodeMenuContext,
    'readOnly' | 'canDescribe' | 'hasDescription' | 'onRenameNode' | 'onAddDescription' | 'onRemoveDescription'
> {
    field: string;
    onDelete: () => void;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
}

export interface ReturnFieldMenuContext {
    model: ReturnNodeModel;
    item: ReturnField;
    onMove: (direction: MoveDirection) => void;
    onDelete: () => void;
}
