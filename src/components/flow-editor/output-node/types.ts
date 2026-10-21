import type {Node} from '@xyflow/react';

/** ReactFlow node data of an OutputNode. The value shown comes from the wire into the node, not from the data. */
export type OutputNodeData = {
    label?: string; // title; falls back to 'Output'
};

export type OutputNodeType = Node<OutputNodeData, 'outputNode'>;

/** The value of one model path as the engine evaluates it, or why it cannot be shown. */
export type OutputReading = {value: unknown; type: string} | {error: string};
