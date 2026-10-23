import type {Node} from '@xyflow/react';
import type {SignatureParameter} from '../../boxed-editor';
import type {
    CoreNodeData,
    CoreNodeMenuContext,
    FlowEditorOpenTarget,
    MoveDirection,
    NodeEditing,
    RowEditing,
} from '../core-node/types';

/** ReactFlow node data of a FunctionNode; the node id is the field path. */
export type FunctionNodeData = CoreNodeData;

export type FunctionNodeType = Node<FunctionNodeData, 'functionNode'>;

export type CalleeKind = 'function' | 'ruleset';

export interface CalleeRef {
    path: string; // dotted callee path, for example 'risk' or 'group.nested'
    kind: CalleeKind;
    parameters: SignatureParameter[]; // from get(path, 'FIELDS')
    returnLabel: string; // 'number' or '{ level, limit }'
}

export interface NodeArgument {
    name: string;
    type: string; // 'number', 'string', 'Applicant', 'number[]'
    binding?: {kind: 'path' | 'value'; text: string}; // 'path' draws a wire; 'value' is a literal or expression
    used: boolean; // the callee body references it; Delete argument is disabled
}

export interface NodeResult {
    name: string; // field name, or 'result' for an unnamed return
    type: string;
    renamable: boolean; // false for the unnamed return of a func
}

export interface FunctionNodeModel {
    field: string; // model field path
    label?: string; // '@node-name'
    callee?: CalleeRef; // undefined while no callee is picked
    arguments: NodeArgument[]; // one per callee parameter, in signature order
    results: NodeResult[]; // record fields, or one unnamed 'result'
    draft: boolean; // true while a required argument is unbound; the draft is not in the model
    callers: number; // invocations of the callee in the whole model
    error?: {parameter: string; message: string}; // last rejected bindArgument
}

/** The row edits of a FunctionNode: an argument or a result rename. */
export type FunctionNodeRowEditing = RowEditing<'argument'> | RowEditing<'result'>;

/** The inline edits of a FunctionNode: the header edits plus the row edits. */
export type FunctionNodeEditing = NodeEditing<FunctionNodeRowEditing>;

export interface CalleePickerProps {
    callees: CalleeRef[];
    selected?: CalleeRef;
    disabled?: boolean;
    opened: boolean; // controlled: the node menu opens it through Change callee…
    onOpenedChange: (opened: boolean) => void;
    onSelect: (method: string) => void;
}

export interface KindIconProps {
    kind: CalleeKind;
    size: number;
    className?: string; // the caller sets the size and shape; the icon sets the background
}

export interface FunctionNodeMenuContext extends CoreNodeMenuContext {
    model: FunctionNodeModel;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
    onChangeCallee: () => void;
    onAddArgument: () => void;
}

export interface ArgumentMenuContext {
    model: FunctionNodeModel;
    argument: NodeArgument;
    onMove: (direction: MoveDirection) => void;
    onAddBelow: () => void;
    onDelete: () => void;
}
