import type {PortableError} from '@edgerules/portable';
import type {ReactNode} from 'react';
import type {BoxedEditorTargetKind} from '../boxed-editor/BoxedEditorProps';
import type {SignatureParameter, Unsubscribe} from '../boxed-editor/boxed-editor-types';
import type {DocumentationService} from '../documentation-service';

export type {Unsubscribe};

export interface FlowEditorProviderProps {
    service: FlowEditorService; // engine-backed node service from createFlowEditorService()
    documentation?: DocumentationService; // stores node descriptions; omit to hide description UI
    readOnly?: boolean; // disables every mutation; menus show only non-mutating items
    onOpenNode?: (target: FlowEditorOpenTarget) => void; // routes "Open in…", "Open tests", "View as code" to the host
    children: ReactNode; // the ReactFlow canvas
}

/** Host routing target; reuses the Boxed Editor kinds and adds 'tests'. */
export interface FlowEditorOpenTarget {
    path: string; // callee path ('risk') or node field path ('decision')
    kind: BoxedEditorTargetKind | 'tests';
}

/** ReactFlow node data; the node id is the field path. */
// A type alias, not an interface: xyflow requires node data to be assignable to Record<string, unknown>.
export type FunctionNodeData = {
    field: string; // model field path of the invocation, for example 'decision'
};

export interface CalleeRef {
    path: string; // dotted callee path, for example 'risk' or 'group.nested'
    kind: 'function' | 'ruleset';
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

export interface FlowEditorService {
    listCallees(): CalleeRef[]; // user func and ruleset entries with only typed parameters
    getFunctionNode(field: string): FunctionNodeModel; // committed invocation plus any draft overlay
    createDraftNode(): string; // new field name from uniqueName('node', …); no callee, nothing written
    setCallee(field: string, method: string): PortableError | void; // keeps bindings with same name and type
    bindArgument(field: string, parameter: string, sourcePath: string): PortableError | void; // link-checked
    unbindArgument(field: string, parameter: string): void; // turns the node into a draft
    setNodeName(field: string, name: string): PortableError | void; // '@node-name' only; '' clears it
    renameField(field: string, newName: string): PortableError | void; // rewrites wires; the caller moves the description
    duplicate(field: string): string | PortableError; // returns the new field name
    removeFromFlow(field: string): PortableError | void; // a write without `@node`; the field stays
    deleteField(field: string): PortableError | void; // remove(field), link-checked
    addArgument(field: string, after?: string): PortableError | void; // after = undefined appends
    moveArgument(field: string, parameter: string, direction: 'up' | 'down'): PortableError | void;
    renameArgument(field: string, from: string, to: string): PortableError | void; // names a new argument; migrates call sites
    removeArgument(field: string, parameter: string): PortableError | void; // refused when the body uses it
    renameResult(field: string, from: string, to: string): PortableError | void; // link-checked, reverted on failure
    subscribe(listener: () => void): Unsubscribe; // fires after every committed change
}
