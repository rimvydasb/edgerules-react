import type {PortableError} from '@edgerules/portable';
import type {ReactNode} from 'react';
import type {CodeEditorEmbedContext, CodeEditorService} from '../code-editor-cell';
import type {Unsubscribe} from '#lib/changeBatch';
import type {DocumentationService} from '../documentation-service';
import type {FlowEditorOpenTarget} from './core-node/types';
import type {CalleeRef, FunctionNodeModel} from './function-node/types';
import type {ListInputNodeModel} from './list-input-node/types';
import type {ObjectInputNodeModel} from './object-input-node/types';
import type {ExpressionNodeModel} from './expression-node/types';
import type {OutputReading} from './output-node/types';
import type {ParameterNodeModel} from './parameter-node/types';
import type {ResultNodeModel} from './result-node/types';
import type {ValueInputNodeModel} from './value-input-node/types';

export type {FlowEditorOpenTarget, Unsubscribe};

export interface FlowEditorProviderProps {
    service: FlowEditorService; // engine-backed node service from createFlowEditorService()
    documentation?: DocumentationService; // stores node descriptions; omit to hide description UI
    languageService?: CodeEditorService; // diagnostics and completions of value cells; omit to show values read-only
    readOnly?: boolean; // disables every mutation; menus show only non-mutating items
    onOpenNode?: (target: FlowEditorOpenTarget) => void; // routes "Open in…", "Open tests", "View as code" to the host
    children: ReactNode; // the ReactFlow canvas
}

/**
 * One model field that the canvas draws as a node; the node id is the field path. A service flow adds a node per
 * parameter of the service ('<service>.<parameter>') and its result ('<service>.return'). Every other expression of
 * the flow context is an expression node.
 */
export interface FlowNodeRef {
    field: string;
    kind: 'function' | 'object-input' | 'list-input' | 'value-input' | 'parameter' | 'result' | 'expression'; // inputs: an `@InputNode` record, list or single value
}

export interface FlowEditorService {
    listNodes(): FlowNodeRef[]; // a service: its parameters, then '@node' annotated fields and expressions in model order, then the drafts
    isService(): boolean; // the root is a `@Service` function: its flow has parameter and result nodes
    listCallees(): CalleeRef[]; // user func and ruleset entries with only typed parameters
    getFunctionNode(field: string): FunctionNodeModel; // committed invocation plus any draft overlay
    createDraftNode(): string; // new field name from uniqueName('node', …); no callee, nothing written
    setCallee(field: string, method: string): PortableError | void; // keeps bindings with same name and type
    bindArgument(field: string, parameter: string, sourcePath: string): PortableError | void; // link-checked
    unbindArgument(field: string, parameter: string): void; // turns the node into a draft
    setNodeName(field: string, name: string): PortableError | void; // '@node-name' only; '' clears it
    renameField(field: string, newName: string): PortableError | void; // rewrites wires; the caller moves the description
    duplicate(field: string): string | PortableError; // returns the new field name
    removeFromFlow(field: string): PortableError | void; // a write without `@node`; the field stays; refused for an expression
    deleteField(field: string): PortableError | void; // remove(field), link-checked; a parameter: refused while the body reads it
    addArgument(field: string, after?: string): PortableError | void; // after = undefined appends
    moveArgument(field: string, parameter: string, direction: 'up' | 'down'): PortableError | void;
    renameArgument(field: string, from: string, to: string): PortableError | void; // names a new argument; migrates call sites
    removeArgument(field: string, parameter: string): PortableError | void; // refused when the body uses it
    renameResult(field: string, from: string, to: string): PortableError | void; // link-checked, reverted on failure
    getObjectInputNode(field: string): ObjectInputNodeModel; // the record annotated @InputNode; no fields when it does not exist
    getListInputNode(field: string): ListInputNodeModel; // the list annotated @InputNode; no item fields when it does not exist
    getValueInputNode(field: string): ValueInputNodeModel; // the single value annotated @InputNode; no value when it does not exist
    getExpressionNode(field: string): ExpressionNodeModel; // an expression no other node shows, with its `@variables`; no expression when it does not exist
    listInputCandidates(): FlowNodeRef[]; // records and list literals of the model that are not yet an input node
    addInputNode(field: string): PortableError | void; // annotates an existing record or list with '@node: InputNode'
    createInputNode(kind?: 'object-input' | 'list-input' | 'value-input'): string | PortableError; // a new '@InputNode': record 'input…' with one number field (default), list 'list…' of numbers or number 'value…'
    addInputField(field: string, after?: string): PortableError | void; // appends a number field; after = undefined appends
    moveInputField(field: string, name: string, direction: 'up' | 'down'): PortableError | void;
    removeInputField(field: string, name: string): PortableError | void; // link-checked, reverted when something reads it
    renameInputField(field: string, from: string, to: string): PortableError | void; // link-checked, reverted on failure
    setInputFieldValue(field: string, name: string, text: string): PortableError | void; // an expression; link-checked
    setInputValue(field: string, text: string): PortableError | void; // the expression of a single value input; link-checked
    inputValueContext(field: string, name?: string): CodeEditorEmbedContext; // model text around the value of a field; no name: of a single value input
    getParameterNode(field: string): ParameterNodeModel; // one parameter of the service, with the fields of its record type
    createParameter(): string | PortableError; // a new 'number' parameter 'param…' of the service; returns its node id
    renameParameter(field: string, to: string): PortableError | void; // migrates the body and the call sites
    setParameterType(field: string, type: string): PortableError | void; // link-checked
    getResultNode(field: string): ResultNodeModel; // the `return` record of the service annotated @ResultNode
    createResultNode(): string | PortableError; // annotates `return`, or creates it with every value the service returns now
    bindResultField(field: string, name: string | undefined, sourcePath: string): PortableError | void; // no name: a new field named after the source
    renameResultField(field: string, from: string, to: string): PortableError | void; // link-checked
    moveResultField(field: string, name: string, direction: 'up' | 'down'): PortableError | void;
    removeResultField(field: string, name: string): PortableError | void; // link-checked: refused while a caller reads it
    setResultFieldValue(field: string, name: string, text: string): PortableError | void; // an expression; link-checked
    readOutput(source: string): Promise<OutputReading>; // evaluates a model path, for example 'decision.level'
    subscribe(listener: () => void): Unsubscribe; // fires after every committed change
    invalidate(): void; // fires the listeners after a change of the model made outside this service
}
