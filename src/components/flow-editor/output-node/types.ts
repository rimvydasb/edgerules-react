import type {Node} from '@xyflow/react';

/** ReactFlow node data of an OutputNode. The value shown comes from the wire into the node, not from the data. */
export type OutputNodeData = {
    label?: string; // title; falls back to 'Output'
    description?: string; // canvas note under the header; absent hides the row
};

export type OutputNodeType = Node<OutputNodeData, 'outputNode'>;

/**
 * The value of one model path as the engine evaluates it, or why it cannot be shown. `columns` names the item fields
 * of an empty list of records, from its declared type.
 */
export type OutputReading = {value: unknown; type: string; columns?: string[]} | {error: string};

/** OutputNode internals: not part of the npm public API. */
export interface OutputNodeMenuContext {
    readOnly: boolean;
    hasDescription: boolean;
    onRenameNode: () => void;
    onDuplicate?: () => void; // absent outside a FlowEditor canvas
    onAddDescription: () => void;
    onRemoveDescription: () => void;
    onDelete: () => void;
}
