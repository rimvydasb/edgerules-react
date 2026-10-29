import type {PortableError} from '@edgerules/portable';
import type {ReactNode} from 'react';
import type {CodeEditorEmbedContext, CodeEditorService} from '../code-editor-cell';
import type {Unsubscribe} from '#lib/changeBatch';
import type {DocumentationService} from '../documentation-service';
import type {FlowEditorOpenTarget} from './core-node/types';
import type {CalleeRef, FunctionNodeModel} from './function-node/types';
import type {ListInputNodeModel} from './list-input-node/types';
import type {ObjectInputNodeModel} from './object-input-node/types';
import type {OutputReading} from './output-node/types';

export type {FlowEditorOpenTarget, Unsubscribe};

export interface FlowEditorProviderProps {
    service: FlowEditorService; // engine-backed node service from createFlowEditorService()
    documentation?: DocumentationService; // stores node descriptions; omit to hide description UI
    languageService?: CodeEditorService; // diagnostics and completions of value cells; omit to show values read-only
    readOnly?: boolean; // disables every mutation; menus show only non-mutating items
    onOpenNode?: (target: FlowEditorOpenTarget) => void; // routes "Open in…", "Open tests", "View as code" to the host
    children: ReactNode; // the ReactFlow canvas
}

/** One model field that the canvas draws as a node; the node id is the field path. */
export interface FlowNodeRef {
    field: string;
    kind: 'function' | 'object-input' | 'list-input'; // an `@InputNode` record or list
}

export interface FlowEditorService {
    listNodes(): FlowNodeRef[]; // '@node' annotated fields in model order, then the drafts
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
    getObjectInputNode(field: string): ObjectInputNodeModel; // the record annotated @InputNode; no fields when it does not exist
    getListInputNode(field: string): ListInputNodeModel; // the list annotated @InputNode; no item fields when it does not exist
    listInputCandidates(): FlowNodeRef[]; // records and list literals of the model that are not yet an input node
    addInputNode(field: string): PortableError | void; // annotates an existing record or list with '@node: InputNode'
    createInputNode(): string | PortableError; // a new '@InputNode' record 'input…' with one number field
    addInputField(field: string, after?: string): PortableError | void; // appends a number field; after = undefined appends
    moveInputField(field: string, name: string, direction: 'up' | 'down'): PortableError | void;
    removeInputField(field: string, name: string): PortableError | void; // link-checked, reverted when something reads it
    renameInputField(field: string, from: string, to: string): PortableError | void; // link-checked, reverted on failure
    setInputFieldValue(field: string, name: string, text: string): PortableError | void; // an expression; link-checked
    inputValueContext(field: string, name: string): CodeEditorEmbedContext; // model text around the value of a field
    readOutput(source: string): Promise<OutputReading>; // evaluates a model path, for example 'decision.level'
    subscribe(listener: () => void): Unsubscribe; // fires after every committed change
    invalidate(): void; // fires the listeners after a change of the model made outside this service
}
