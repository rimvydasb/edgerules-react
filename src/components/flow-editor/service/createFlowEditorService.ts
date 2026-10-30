import type {PortableError, PortableNode, PortableRootContext} from '@edgerules/portable';
import {listCallables, type CallableSource} from '#lib/callables';
import {setWithLinkCheck, type LinkCheckService} from '#lib/linkCheck';
import {isPortableError} from '#lib/portable';
import {
    addArgument as addFunctionArgument,
    addConditionColumn,
    buildExpressionEmbedContext,
    createBoxedEditorService,
    denormalize,
    moveArgument as moveFunctionArgument,
    moveConditionColumn,
    removeArgument as removeFunctionArgument,
    removeConditionColumn,
    renameArgument as renameFunctionArgument,
    renameConditionColumn,
    renameActionColumn,
    uniqueName,
} from '../../boxed-editor/internal';
import type {BoxedTableRowData, SignatureParameter} from '../../boxed-editor';
import {childPath, formatPortableValue, isRecord, parentPath, portableAtPath, typeText} from '#lib/portableUtils';
import type {FlowEditorService, FlowNodeRef} from '../flow-editor-types';
import type {CalleeRef, FunctionNodeModel, NodeArgument, NodeResult} from '../function-node/types';
import type {ListInputNodeModel} from '../list-input-node/types';
import type {InputDeclarationKind, ObjectInputField, ObjectInputNodeModel} from '../object-input-node/types';
import type {ParameterField, ParameterNodeModel} from '../parameter-node/types';
import type {ResultNodeModel} from '../result-node/types';
import type {ValueInputNodeModel} from '../value-input-node/types';

type GetFilter = 'FIELDS' | 'ALL' | 'EXTERNAL_DEFINITIONS';
type InputKind = 'object-input' | 'list-input' | 'value-input';

// `@node` of a function whose flow has parameter and result nodes, and of the `return` record that is its result.
const SERVICE_ANNOTATION = 'Service';
const RESULT_ANNOTATION = 'ResultNode';
// The body field whose value a function returns.
const RESULT_FIELD = 'return';

/** Structural subset of `MutableDecisionService` that the flow editor service uses. */
export interface FlowEditorEngine extends CallableSource, LinkCheckService {
    get(path: string, filter?: GetFilter): PortableNode | PortableError;
    toPortable(): PortableRootContext;
    execute(method: string, input?: Record<string, unknown>): Promise<unknown>;
}

// The invocation as the node edits it. Arguments are expression texts, as in the Portable format.
interface InvocationState {
    method?: string;
    label?: string;
    args: Record<string, string>;
}

interface CalleeSchema {
    ref: CalleeRef;
    results: NodeResult[];
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\[\d+\]|\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function parametersOf(schema: unknown): SignatureParameter[] {
    if (!isRecord(schema) || !isRecord(schema['@parameters'])) return [];
    return Object.entries(schema['@parameters']).map(([name, type]) => ({
        name,
        type: typeText(type) ?? 'any',
    }));
}

function resultsOf(schema: unknown, kind: CalleeRef['kind']): NodeResult[] {
    const ret = isRecord(schema) ? schema['@return'] : undefined;
    if (isRecord(ret) && ret['@kind'] === 'type-definition') {
        return Object.entries(ret)
            .filter(([name]) => !name.startsWith('@'))
            .map(([name, type]) => ({name, type: typeText(type) ?? 'any', renamable: true}));
    }
    return [{name: 'result', type: typeText(ret) ?? 'any', renamable: kind === 'ruleset', whole: true}];
}

function returnLabelOf(results: NodeResult[], schema: unknown): string {
    const ret = isRecord(schema) ? schema['@return'] : undefined;
    if (isRecord(ret) && ret['@kind'] === 'type-definition') {
        return `{ ${results.map((result) => result.name).join(', ')} }`;
    }
    return results[0]?.type ?? 'any';
}

function isInvocation(node: unknown): node is Record<string, unknown> {
    return isRecord(node) && node['@kind'] === 'invocation';
}

function countInvocations(node: unknown, method: string): number {
    if (Array.isArray(node)) return node.reduce((sum, item) => sum + countInvocations(item, method), 0);
    if (!isRecord(node)) return 0;
    let count = isInvocation(node) && node['@method'] === method ? 1 : 0;
    for (const child of Object.values(node)) count += countInvocations(child, method);
    return count;
}

function bindingOf(text: string | undefined): NodeArgument['binding'] {
    if (text === undefined) return undefined;
    return {kind: PATH_PATTERN.test(text.trim()) ? 'path' : 'value', text};
}

// A positional call `f(a, b)` stores its arguments as a list; `parameters` names them by position.
function argumentTexts(node: Record<string, unknown>, parameters: string[]): Record<string, string> {
    const raw = node['@arguments'];
    const args: Record<string, string> = {};
    const entries: [string | undefined, unknown][] = Array.isArray(raw)
        ? raw.map((value, index) => [parameters[index], value])
        : isRecord(raw)
          ? Object.entries(raw)
          : [];
    for (const [name, value] of entries) {
        if (name === undefined) continue;
        if (typeof value === 'string') args[name] = value;
        else if (isRecord(value) && typeof value.expression === 'string') args[name] = value.expression;
        else if (value !== undefined) args[name] = JSON.stringify(value);
    }
    return args;
}

export interface FlowEditorServiceOptions {
    // The context whose direct fields are the nodes: '*' (the default), a context path or a function path, whose
    // body is the context. New nodes are fields of it.
    root?: string;
}

export function createFlowEditorService(
    engine: FlowEditorEngine,
    {root = '*'}: FlowEditorServiceOptions = {},
): FlowEditorService {
    const boxed = createBoxedEditorService(engine as never);
    const drafts = new Map<string, InvocationState>();
    const errors = new Map<string, {parameter: string; message: string}>();
    const listeners = new Set<() => void>();

    const notify = () => {
        for (const listener of [...listeners]) listener();
    };

    // The type of a list path from the linked model, and the field names of its items when they are records.
    const declaredListType = (path: string): {type: string; columns?: string[]} => {
        let schema: unknown;
        try {
            schema = engine.get(path);
        } catch {
            return {type: 'any[]'};
        }
        if (!isRecord(schema) || schema['@kind'] === 'error') return {type: 'any[]'};
        const items = schema.items;
        const columns = isRecord(items) ? Object.keys(items).filter((name) => !name.startsWith('@')) : [];
        return {type: typeText(schema) ?? 'any[]', ...(columns.length > 0 && {columns})};
    };

    // Schemas exist only for a linked model; a model that fails to link has no callees to offer.
    const ensureLinked = () => {
        try {
            engine.link();
        } catch {
            // The reads below return errors and are skipped.
        }
    };

    const readSchema = (ref: {path: string; kind: CalleeRef['kind']}): CalleeSchema | undefined => {
        const schema = engine.get(ref.path, 'FIELDS');
        if (isPortableError(schema)) return undefined;
        const results = resultsOf(schema, ref.kind);
        return {
            ref: {
                path: ref.path,
                kind: ref.kind,
                parameters: parametersOf(schema),
                returnLabel: returnLabelOf(results, schema),
            },
            results,
        };
    };

    const calleeSchemas = (): CalleeSchema[] => {
        ensureLinked();
        const schemas: CalleeSchema[] = [];
        for (const callable of listCallables(engine)) {
            if (callable.kind !== 'function' && callable.kind !== 'ruleset') continue;
            const schema = readSchema({path: callable.path, kind: callable.kind});
            if (schema) schemas.push(schema);
        }
        return schemas;
    };

    const committedAt = (field: string): Record<string, unknown> | undefined => {
        const node = portableAtPath(engine.toPortable() as PortableNode, field);
        return isInvocation(node) ? node : undefined;
    };

    // The input node kind of a model field: a record, an expression whose value is a list, or another expression.
    const inputKindOf = (field: string, node: unknown): InputKind | undefined => {
        if (!isRecord(node)) return undefined;
        if (node['@kind'] === 'context') return 'object-input';
        if (node['@kind'] !== 'expression') return undefined;
        ensureLinked();
        const type = typeText(engine.get(field));
        return type?.endsWith('[]') ? 'list-input' : 'value-input';
    };

    // The record or the list at `field` when it is annotated `@node: 'InputNode'`.
    const inputAt = (field: string): Record<string, unknown> | undefined => {
        const node = portableAtPath(engine.toPortable() as PortableNode, field);
        return isRecord(node) && node['@node'] === 'InputNode' && inputKindOf(field, node) ? node : undefined;
    };

    // The record at `field` when it is annotated `@node: 'InputNode'`.
    const objectInputAt = (field: string): Record<string, unknown> | undefined => {
        const node = portableAtPath(engine.toPortable() as PortableNode, field);
        return isRecord(node) && node['@kind'] === 'context' && node['@node'] === 'InputNode' ? node : undefined;
    };

    // Rewrites the fields of an input record in one link-checked write; the annotations stay.
    const editInput = (
        field: string,
        edit: (entries: [string, unknown][]) => [string, unknown][] | undefined,
    ): PortableError | void => {
        const input = objectInputAt(field);
        if (!input) return failure(`node '${field}' does not exist`);
        const entries = Object.entries(input).filter(([key]) => !key.startsWith('@'));
        const next = edit(entries);
        if (!next) return;
        const meta = Object.entries(input).filter(([key]) => key.startsWith('@'));
        const record = Object.fromEntries([...meta, ...next]) as unknown as PortableNode;
        const result = setWithLinkCheck(engine, field, record, input as unknown as PortableNode);
        if (isPortableError(result)) return result;
        notify();
    };

    // The context at `path`: the model for '*', the body of a function.
    const contextAt = (path: string): Record<string, unknown> | undefined => {
        const model = engine.toPortable() as PortableNode;
        const node: unknown = path === '*' ? model : portableAtPath(model, path);
        const context = isRecord(node) && node['@kind'] === 'function' ? node['@body'] : node;
        return isRecord(context) ? context : undefined;
    };

    // The field names next to `field`, drafts included.
    const siblingNames = (field: string): Set<string> => {
        const parent = parentPath(field) ?? '*';
        const draftNames = [...drafts.keys()].filter((draft) => (parentPath(draft) ?? '*') === parent);
        return new Set([
            ...Object.keys(contextAt(parent) ?? {}),
            ...draftNames.map((draft) => draft.split('.').at(-1)!),
        ]);
    };

    // `path` as the argument of a node at `field`. A function body cannot read a path through its own function, so a
    // field of that body is read by its short name; elsewhere the path from the model root stays.
    const bindingPath = (field: string, path: string): string => {
        const scope = parentPath(field) ?? '*';
        if (scope === '*' || !path.startsWith(`${scope}.`)) return path;
        const owner: unknown = portableAtPath(engine.toPortable() as PortableNode, scope);
        return isRecord(owner) && owner['@kind'] === 'function' ? path.slice(scope.length + 1) : path;
    };

    // True when an expression reads `<field>.<name>`: by its path anywhere in the model, or by its short name in the
    // scope of `field`.
    const isRead = (field: string, name: string): boolean => {
        if (readsPath(engine.toPortable(), `${field}.${name}`)) return true;
        const scope = parentPath(field) ?? '*';
        return scope !== '*' && readsPath(contextAt(scope), `${field.slice(scope.length + 1)}.${name}`);
    };

    // A new field of the root context, named `base`, `base2`…
    const newRootField = (base: string): string =>
        childPath(root, uniqueName(base, siblingNames(childPath(root, base))));

    // The root function when it is annotated `@Service`.
    const serviceAt = (): Record<string, unknown> | undefined => {
        if (root === '*') return undefined;
        const node: unknown = portableAtPath(engine.toPortable() as PortableNode, root);
        return isRecord(node) && node['@kind'] === 'function' && node['@node'] === SERVICE_ANNOTATION
            ? node
            : undefined;
    };

    const parametersOfService = (service: Record<string, unknown> | undefined): Record<string, unknown> =>
        isRecord(service?.['@parameters']) ? service['@parameters'] : {};

    // The parameter name of a parameter node id '<service>.<parameter>', when the service has that parameter.
    const parameterName = (field: string): string | undefined => {
        if (!field.startsWith(`${root}.`)) return undefined;
        const name = field.slice(root.length + 1);
        return name in parametersOfService(serviceAt()) ? name : undefined;
    };

    // The `return` record of the service when it is annotated `@ResultNode`.
    const resultAt = (field: string = childPath(root, RESULT_FIELD)): Record<string, unknown> | undefined => {
        if (!serviceAt() || field !== childPath(root, RESULT_FIELD)) return undefined;
        const node = contextAt(root)?.[RESULT_FIELD];
        return isRecord(node) && node['@kind'] === 'context' && node['@node'] === RESULT_ANNOTATION ? node : undefined;
    };

    // Writes the whole model with the parameters of the service rewritten, then links; restored on a failure.
    const editParameters = (
        edit: (parameters: [string, unknown][]) => [string, unknown][],
        migrate: (model: unknown) => unknown = (model) => model,
    ): PortableError | void => {
        const service = serviceAt();
        if (!service) return failure(`'${root}' is not a service`);
        const previous = engine.toPortable();
        const parameters = Object.fromEntries(edit(Object.entries(parametersOfService(service))));
        const next = migrate(
            replaceAt(previous, root, {...service, '@parameters': parameters} as unknown as PortableNode),
        );
        const written = writeChangedEntries(engine, next as PortableRootContext, previous);
        if (isPortableError(written)) return written;
        boxed.invalidate();
        notify();
    };

    // Rewrites the fields of the result record in one link-checked write; the annotations stay.
    const editResult = (
        field: string,
        edit: (entries: [string, unknown][]) => [string, unknown][] | undefined,
    ): PortableError | void => {
        const result = resultAt(field);
        if (!result) return failure(`node '${field}' does not exist`);
        const entries = Object.entries(result).filter(([key]) => !key.startsWith('@'));
        const next = edit(entries);
        if (!next) return;
        const meta = Object.entries(result).filter(([key]) => key.startsWith('@'));
        const record = Object.fromEntries([...meta, ...next]) as unknown as PortableNode;
        const written = setWithLinkCheck(engine, field, record, result as unknown as PortableNode);
        if (isPortableError(written)) return written;
        notify();
    };

    const stateOf = (field: string): InvocationState | undefined => {
        const draft = drafts.get(field);
        if (draft) return draft;
        const committed = committedAt(field);
        if (!committed) return undefined;
        return {
            method: typeof committed['@method'] === 'string' ? committed['@method'] : undefined,
            label: typeof committed['@node-name'] === 'string' ? committed['@node-name'] : undefined,
            args: argumentTexts(
                committed,
                (
                    calleeOf(typeof committed['@method'] === 'string' ? committed['@method'] : undefined)?.parameters ??
                    []
                ).map((parameter) => parameter.name),
            ),
        };
    };

    const usedBy = (calleePath: string, parameter: string): boolean => {
        // The linked `ALL` view is a schema without the body; the authored definition has it.
        const definition = portableAtPath(engine.toPortable() as PortableNode, calleePath);
        if (!isRecord(definition)) return false;
        const {'@parameters': _parameters, ...rest} = definition;
        return new RegExp(`\\b${parameter}\\b`).test(JSON.stringify(rest));
    };

    const isRequired = (parameter: SignatureParameter) => parameter.required !== false;

    const isComplete = (callee: CalleeRef, args: Record<string, string>) =>
        callee.parameters.every((parameter) => !isRequired(parameter) || args[parameter.name] !== undefined);

    const toInvocation = (state: InvocationState, callee: CalleeRef): PortableNode => {
        const args: Record<string, string> = {};
        for (const parameter of callee.parameters) {
            const text = state.args[parameter.name];
            if (text !== undefined) args[parameter.name] = text;
        }
        return {
            '@kind': 'invocation',
            '@method': callee.path,
            '@arguments': args,
            '@node': 'FunctionNode',
            ...(state.label === undefined ? {} : {'@node-name': state.label}),
        } as unknown as PortableNode;
    };

    const calleeOf = (method: string | undefined): CalleeRef | undefined =>
        method === undefined ? undefined : calleeSchemas().find((schema) => schema.ref.path === method)?.ref;

    // Stores an incomplete invocation as a draft; writes a complete one with a link check.
    const commit = (field: string, state: InvocationState): PortableError | void => {
        const callee = calleeOf(state.method);
        if (!callee || !isComplete(callee, state.args)) {
            drafts.set(field, state);
            return;
        }
        const previous = committedAt(field) as PortableNode | undefined;
        const result = setWithLinkCheck(engine, field, toInvocation(state, callee), previous);
        if (isPortableError(result)) return result;
        drafts.delete(field);
    };

    // The cached row has no children; a ruleset needs its rules to be written back whole.
    const fullRow = (path: string): BoxedTableRowData | undefined => {
        const row = boxed.getBoxedRowData(path) as BoxedTableRowData | undefined;
        return row && {...row, children: boxed.getBoxedRowsData(path)};
    };

    // Edits the callee definition through the Boxed Editor service, which migrates every call site.
    const editCallee = (
        field: string,
        edit: (row: BoxedTableRowData, callee: CalleeRef) => BoxedTableRowData | undefined,
    ): PortableError | void => {
        const callee = calleeOf(stateOf(field)?.method);
        if (!callee) return noCallee(field);
        boxed.invalidate(callee.path);
        const row = fullRow(callee.path);
        if (!row) return failure(`'${callee.path}' does not exist`);
        const next = edit(row, callee);
        if (!next) return;
        const result = boxed.setBoxedRowData(callee.path, next);
        if (isPortableError(result)) return result;
        notify();
    };

    return {
        listNodes(): FlowNodeRef[] {
            const service = serviceAt();
            // A service reads its parameters first: they are the inputs of its flow.
            const nodes: FlowNodeRef[] = Object.keys(parametersOfService(service)).map((name) => ({
                field: childPath(root, name),
                kind: 'parameter',
            }));
            // Direct fields only: a node of a child context belongs to the flow of that context.
            for (const [key, child] of Object.entries(contextAt(root) ?? {})) {
                if (key.startsWith('@') || !isRecord(child)) continue;
                const field = childPath(root, key);
                if (isInvocation(child) && child['@node'] === 'FunctionNode') nodes.push({field, kind: 'function'});
                else if (key === RESULT_FIELD) {
                    if (resultAt(field)) nodes.push({field, kind: 'result'});
                } else if (child['@node'] === 'InputNode') {
                    const kind = inputKindOf(field, child);
                    if (kind) nodes.push({field, kind});
                }
            }
            const listed = new Set(nodes.map((node) => node.field));
            for (const field of drafts.keys()) {
                if (!listed.has(field)) nodes.push({field, kind: 'function'});
            }
            return nodes;
        },

        isService: () => serviceAt() !== undefined,

        listCallees: () => calleeSchemas().map((schema) => schema.ref),

        getFunctionNode(field): FunctionNodeModel {
            const state = stateOf(field);
            const schemas = calleeSchemas();
            const schema = schemas.find((candidate) => candidate.ref.path === state?.method);
            const callee = schema?.ref;
            const args = state?.args ?? {};
            const callers = callee ? countInvocations(engine.toPortable(), callee.path) : 0;
            return {
                field,
                label: state?.label,
                callee,
                arguments: (callee?.parameters ?? []).map((parameter) => ({
                    name: parameter.name,
                    type: parameter.type ?? 'any',
                    binding: bindingOf(args[parameter.name]),
                    used: usedBy(callee!.path, parameter.name),
                })),
                results: schema?.results ?? [],
                draft: drafts.has(field) || !callee,
                callers,
                error: errors.get(field),
            };
        },

        createDraftNode() {
            const field = newRootField('node');
            drafts.set(field, {args: {}});
            notify();
            return field;
        },

        setCallee(field, method) {
            const callee = calleeOf(method);
            if (!callee) return unknownCallee(method);
            const previous = stateOf(field);
            const previousCallee = calleeOf(previous?.method);
            const kept: Record<string, string> = {};
            for (const parameter of callee.parameters) {
                const old = previousCallee?.parameters.find((candidate) => candidate.name === parameter.name);
                const text = previous?.args[parameter.name];
                if (old && old.type === parameter.type && text !== undefined) kept[parameter.name] = text;
            }
            errors.delete(field);
            const error = commit(field, {method, label: previous?.label, args: kept});
            if (error) return error;
            notify();
        },

        bindArgument(field, parameter, sourcePath) {
            const state = stateOf(field);
            const callee = calleeOf(state?.method);
            if (!state || !callee) return noCallee(field);
            errors.delete(field);
            const args = {...state.args, [parameter]: bindingPath(field, sourcePath)};
            const error = commit(field, {...state, args});
            if (error) {
                errors.set(field, {parameter, message: error.message});
                notify();
                return error;
            }
            notify();
        },

        unbindArgument(field, parameter) {
            const state = stateOf(field);
            if (!state) return;
            const {[parameter]: _removed, ...args} = state.args;
            errors.delete(field);
            // A required argument leaves the node a draft; the committed field stays in the model.
            commit(field, {...state, args});
            notify();
        },

        setNodeName(field, name) {
            const input = inputAt(field) ?? resultAt(field);
            if (input) {
                const {'@node-name': _label, ...rest} = input;
                const label = name.trim();
                const next = (label === '' ? rest : {...rest, '@node-name': label}) as unknown as PortableNode;
                const result = setWithLinkCheck(engine, field, next, input as unknown as PortableNode);
                if (isPortableError(result)) return result;
                notify();
                return;
            }
            const state = stateOf(field);
            if (!state) return failure(`node '${field}' does not exist`);
            const label = name.trim() === '' ? undefined : name.trim();
            const error = commit(field, {...state, label});
            if (error) return error;
            notify();
        },

        renameField(field, newName) {
            if (!IDENTIFIER.test(newName)) return failure(`'${newName}' is not a valid field name`);
            if (newName === field.split('.').at(-1)) return;
            if (siblingNames(field).has(newName)) return failure(`'${newName}' already exists`, 'DuplicateName');
            const renamed = childPath(parentPath(field) ?? '*', newName);
            const draft = drafts.get(field);
            if (draft && !committedAt(field)) {
                drafts.delete(field);
                drafts.set(renamed, draft);
            } else {
                boxed.invalidate(field);
                const error = boxed.rename(field, newName);
                if (error) return error;
                const moved = drafts.get(field);
                if (moved) {
                    drafts.delete(field);
                    drafts.set(renamed, moved);
                }
                if (errors.has(field)) {
                    errors.set(renamed, errors.get(field)!);
                    errors.delete(field);
                }
            }
            notify();
        },

        duplicate(field) {
            const base = field.split('.').at(-1)!;
            const copy = childPath(parentPath(field) ?? '*', uniqueName(base, siblingNames(field)));
            const input = inputAt(field);
            if (input) {
                const result = setWithLinkCheck(
                    engine,
                    copy,
                    structuredClone(input) as unknown as PortableNode,
                    undefined,
                );
                if (isPortableError(result)) return result;
                notify();
                return copy;
            }
            const state = stateOf(field);
            if (!state) return failure(`node '${field}' does not exist`);
            const error = commit(copy, {...state, args: {...state.args}});
            if (error) return error;
            notify();
            return copy;
        },

        removeFromFlow(field) {
            if (parameterName(field)) return failure('A parameter is always on the flow of its service');
            if (resultAt(field)) {
                const result = engine.remove(`${field}.@${RESULT_ANNOTATION}`);
                if (isPortableError(result)) return result;
                notify();
                return;
            }
            if (inputAt(field)) {
                // `set` keeps the annotations of a record when it gets none; the annotation named after the
                // node type is removed with both `@node` and `@node-name`.
                const result = engine.remove(`${field}.@InputNode`);
                if (isPortableError(result)) return result;
                notify();
                return;
            }
            const committed = committedAt(field);
            drafts.delete(field);
            errors.delete(field);
            if (committed) {
                // `remove('<field>.@FunctionNode')` answers 'entry not found' on this engine version; a plain
                // write without the node metadata keeps the invocation and drops the annotation.
                const {'@node': _node, '@node-name': _label, ...invocation} = committed;
                const result = engine.set(field, invocation as unknown as PortableNode);
                if (isPortableError(result)) return result;
            }
            notify();
        },

        deleteField(field) {
            const parameter = parameterName(field);
            if (parameter) {
                if (usedBy(root, parameter)) return failure(`'${parameter}' is read by '${root}'`);
                return editParameters(
                    (parameters) => parameters.filter(([name]) => name !== parameter),
                    (model) => removeCallArgument(model, root, parameter),
                );
            }
            const draftOnly = drafts.has(field) && !committedAt(field);
            drafts.delete(field);
            errors.delete(field);
            if (draftOnly) {
                notify();
                return;
            }
            const previous = (committedAt(field) ?? inputAt(field) ?? resultAt(field)) as PortableNode | undefined;
            const result = engine.remove(field);
            if (isPortableError(result)) return result;
            try {
                engine.link();
            } catch (linkError) {
                if (previous) engine.set(field, previous);
                return linkError as PortableError;
            }
            notify();
        },

        addArgument(field, after) {
            return editCallee(field, (row, callee) => {
                const names = new Set(callee.parameters.map((parameter) => parameter.name));
                const name = uniqueName('arg', names);
                const last = callee.parameters.length;
                const target = after === undefined ? last : callee.parameters.findIndex((p) => p.name === after) + 1;
                if (callee.kind === 'ruleset') {
                    const added = addConditionColumn(row, name);
                    return target === last ? added : moveConditionColumn(added, last, target);
                }
                const added = addFunctionArgument(row, 'number');
                return target === last ? added : moveFunctionArgument(added, last, target);
            });
        },

        moveArgument(field, parameter, direction) {
            return editCallee(field, (row, callee) => {
                const from = callee.parameters.findIndex((candidate) => candidate.name === parameter);
                const to = direction === 'up' ? from - 1 : from + 1;
                if (from < 0 || to < 0 || to >= callee.parameters.length) return undefined;
                return callee.kind === 'ruleset'
                    ? moveConditionColumn(row, from, to)
                    : moveFunctionArgument(row, from, to);
            });
        },

        renameArgument(field, from, to) {
            if (from === to) return;
            if (!IDENTIFIER.test(to)) return failure(`'${to}' is not a valid argument name`);
            const existing = calleeOf(stateOf(field)?.method)?.parameters ?? [];
            if (existing.some((parameter) => parameter.name === to)) {
                return failure(`'${to}' already exists`, 'DuplicateName');
            }
            return editCallee(field, (row, callee) =>
                callee.kind === 'ruleset'
                    ? renameConditionColumn(row, from, to)
                    : renameFunctionArgument(row, from, to),
            );
        },

        removeArgument(field, parameter) {
            return editCallee(field, (row, callee) =>
                callee.kind === 'ruleset'
                    ? removeConditionColumn(row, parameter)
                    : removeFunctionArgument(row, parameter),
            );
        },

        renameResult(field, from, to) {
            const state = stateOf(field);
            const callee = calleeOf(state?.method);
            if (!callee) return noCallee(field);
            const results = calleeSchemas().find((schema) => schema.ref.path === callee.path)?.results ?? [];
            const result = results.find((candidate) => candidate.name === from);
            if (!result?.renamable) return failure(`'${from}' cannot be renamed`);
            if (from === to) return;
            if (!IDENTIFIER.test(to)) return failure(`'${to}' is not a valid result name`);
            if (results.some((candidate) => candidate.name === to))
                return failure(`'${to}' already exists`, 'DuplicateName');
            if (callee.kind === 'function') {
                // The Boxed Editor rename rewrites the references of every caller and reverts on a failed link.
                boxed.invalidate(callee.path);
                const error = boxed.rename(`${callee.path}.${from}`, to);
                if (error) return error;
                notify();
                return;
            }
            const previous = engine.toPortable();
            const callers = invocationFields(previous, callee.path);
            boxed.invalidate(callee.path);
            const row = fullRow(callee.path);
            if (!row) return failure(`'${callee.path}' does not exist`);
            const renamed = replaceAt(previous, callee.path, denormalize(renameActionColumn(row, from, to)));
            const migrated = rewriteMemberReads(renamed, callers, from, to) as PortableRootContext;
            const written = setWithLinkCheck(
                engine,
                '*',
                migrated as unknown as PortableNode,
                previous as unknown as PortableNode,
            );
            if (isPortableError(written)) return written;
            boxed.invalidate();
            notify();
        },

        getObjectInputNode(field): ObjectInputNodeModel {
            const input = objectInputAt(field);
            if (!input) return {field, fields: []};
            ensureLinked();
            const schema = engine.get(field, 'FIELDS');
            const fields: ObjectInputField[] = isRecord(schema)
                ? Object.entries(schema)
                      .filter(([name]) => !name.startsWith('@'))
                      .map(([name, type]) => ({
                          name,
                          type: typeText(type) ?? 'object',
                          value: valueText(input[name]),
                          declaration: declarationKind(input[name]),
                          used: isRead(field, name),
                      }))
                : [];
            const label = input['@node-name'];
            return {field, label: typeof label === 'string' ? label : undefined, fields};
        },

        getValueInputNode(field): ValueInputNodeModel {
            const input = inputAt(field);
            if (!input || input['@kind'] !== 'expression') return {field, type: 'any'};
            ensureLinked();
            const label = input['@node-name'];
            return {
                field,
                label: typeof label === 'string' ? label : undefined,
                type: typeText(engine.get(field)) ?? 'any',
                value: typeof input.expression === 'string' ? input.expression : undefined,
            };
        },

        getListInputNode(field): ListInputNodeModel {
            const input = inputAt(field);
            if (!input || input['@kind'] !== 'expression') return {field, type: 'any[]', itemFields: []};
            ensureLinked();
            const schema = engine.get(field);
            const items = isRecord(schema) ? schema.items : undefined;
            const itemFields = isRecord(items)
                ? Object.entries(items)
                      .filter(([name]) => !name.startsWith('@'))
                      .map(([name, type]) => ({name, type: typeText(type) ?? 'object'}))
                : [];
            const label = input['@node-name'];
            return {
                field,
                label: typeof label === 'string' ? label : undefined,
                type: typeText(schema) ?? 'any[]',
                itemFields,
            };
        },

        listInputCandidates() {
            // Authored data only: a record, or a list literal. A computed list is not an input.
            return Object.entries(contextAt(root) ?? {}).flatMap(([key, child]): FlowNodeRef[] => {
                if (key.startsWith('@') || !isRecord(child) || child['@node'] !== undefined) return [];
                const field = childPath(root, key);
                if (child['@kind'] === 'context') return [{field, kind: 'object-input'}];
                const literal = child['@kind'] === 'expression' && String(child.expression).trim().startsWith('[');
                return literal && inputKindOf(field, child) === 'list-input' ? [{field, kind: 'list-input'}] : [];
            });
        },

        addInputNode(field) {
            const node = portableAtPath(engine.toPortable() as PortableNode, field);
            // A single value input is authored or created new: any expression has a value, computed ones too.
            const kind = inputKindOf(field, node);
            if (!isRecord(node) || (kind !== 'object-input' && kind !== 'list-input')) {
                return failure(`'${field}' is not a record or a list`);
            }
            const result = setWithLinkCheck(
                engine,
                field,
                {...node, '@node': 'InputNode'} as unknown as PortableNode,
                node as unknown as PortableNode,
            );
            if (isPortableError(result)) return result;
            notify();
        },

        createInputNode(kind = 'object-input') {
            const field = newRootField(NEW_INPUT[kind].base);
            const result = setWithLinkCheck(engine, field, NEW_INPUT[kind].node, undefined);
            if (isPortableError(result)) return result;
            notify();
            return field;
        },

        addInputField(field, after) {
            return editInput(field, (entries) => {
                const name = uniqueName('field', new Set(entries.map(([key]) => key)));
                const at = after === undefined ? entries.length : entries.findIndex(([key]) => key === after) + 1;
                return [...entries.slice(0, at), [name, 0], ...entries.slice(at)];
            });
        },

        moveInputField(field, name, direction) {
            return editInput(field, (entries) => {
                const from = entries.findIndex(([key]) => key === name);
                const to = direction === 'up' ? from - 1 : from + 1;
                if (from < 0 || to < 0 || to >= entries.length) return undefined;
                const next = [...entries];
                [next[from], next[to]] = [next[to], next[from]];
                return next;
            });
        },

        removeInputField(field, name) {
            return editInput(field, (entries) => entries.filter(([key]) => key !== name));
        },

        renameInputField(field, from, to) {
            if (from === to) return;
            const input = objectInputAt(field);
            if (!input) return failure(`node '${field}' does not exist`);
            if (!IDENTIFIER.test(to)) return failure(`'${to}' is not a valid field name`);
            const record = portableAtPath(engine.toPortable() as PortableNode, field);
            if (!isRecord(record) || !(from in record)) return failure(`'${from}' does not exist`);
            if (to in record) return failure(`'${to}' already exists`, 'DuplicateName');
            // Path-based: only `<field>.<from>` references change. The Boxed Editor rename rewrites every identifier
            // named `from` in the model, which would also rename same-named callee parameters and call-site arguments.
            const previous = engine.toPortable();
            const renamed = Object.fromEntries(
                Object.entries(record).map(([key, value]) => [key === from ? to : key, value]),
            );
            const next = rewriteMemberReads(
                replaceAt(previous, field, renamed as unknown as PortableNode),
                [field],
                from,
                to,
            ) as PortableRootContext;
            const written = writeChangedEntries(engine, next, previous);
            if (isPortableError(written)) return written;
            boxed.invalidate();
            notify();
        },

        setInputFieldValue(field, name, text) {
            const input = objectInputAt(field);
            if (!input) return failure(`node '${field}' does not exist`);
            if (!(name in input) || name.startsWith('@')) return failure(`'${name}' does not exist`);
            if (valueText(input[name]) === undefined) return failure(`'${field}.${name}' is a record`);
            if (text.trim() === '') return failure('A value is required.');
            const result = setWithLinkCheck(
                engine,
                `${field}.${name}`,
                text as unknown as PortableNode,
                input[name] as PortableNode,
            );
            if (isPortableError(result)) return result;
            notify();
        },

        setInputValue(field, text) {
            const input = inputAt(field);
            if (!input || input['@kind'] !== 'expression') return failure(`node '${field}' does not exist`);
            if (text.trim() === '') return failure('A value is required.');
            const result = setWithLinkCheck(
                engine,
                field,
                {...input, expression: text} as unknown as PortableNode,
                input as unknown as PortableNode,
            );
            if (isPortableError(result)) return result;
            notify();
        },

        inputValueContext(field, name) {
            return buildExpressionEmbedContext(engine.toPortable(), name === undefined ? field : `${field}.${name}`);
        },

        getParameterNode(field): ParameterNodeModel {
            const name = parameterName(field);
            if (!name)
                return {field, name: field.split('.').at(-1)!, type: 'any', fields: [], used: false, exists: false};
            const declared = parametersOfService(serviceAt())[name];
            const type = typeText(declared) ?? 'any';
            // A record type: inline, or a type definition of the model by name.
            let definition: unknown = declared;
            let typePath: string | undefined;
            if (typeof declared === 'string' && !PRIMITIVE_TYPES.has(declared)) {
                const named = engine.get(declared, 'ALL');
                if (isRecord(named) && named['@kind'] === 'type-definition') {
                    definition = named;
                    typePath = declared;
                }
            }
            const fields: ParameterField[] =
                isRecord(definition) && definition['@kind'] === 'type-definition'
                    ? Object.entries(definition)
                          .filter(([key]) => !key.startsWith('@'))
                          .map(([key, child]) => ({name: key, type: typeText(child) ?? 'object'}))
                    : [];
            return {field, name, type, ...(typePath && {typePath}), fields, used: usedBy(root, name), exists: true};
        },

        createParameter() {
            const service = serviceAt();
            if (!service) return failure(`'${root}' is not a service`);
            const taken = new Set([
                ...Object.keys(parametersOfService(service)),
                ...Object.keys(contextAt(root) ?? {}),
            ]);
            const name = uniqueName('param', taken);
            const error = editParameters((parameters) => [...parameters, [name, 'number']]);
            return error ?? childPath(root, name);
        },

        renameParameter(field, to) {
            const from = parameterName(field);
            if (!from) return failure(`node '${field}' does not exist`);
            if (from === to) return;
            if (!IDENTIFIER.test(to)) return failure(`'${to}' is not a valid parameter name`);
            if (to in parametersOfService(serviceAt()) || to in (contextAt(root) ?? {})) {
                return failure(`'${to}' already exists`, 'DuplicateName');
            }
            return editParameters(
                (parameters) => parameters.map(([name, type]) => [name === from ? to : name, type]),
                (model) => {
                    const keys = contextKeys(model, root);
                    const body = keys && renameIdentifier(valueAt(model, keys), from, to);
                    return renameCallArgument(keys ? setAt(model, keys, body) : model, root, from, to);
                },
            );
        },

        setParameterType(field, type) {
            const name = parameterName(field);
            if (!name) return failure(`node '${field}' does not exist`);
            const text = type.trim();
            if (text === '') return failure('A type is required.');
            return editParameters((parameters) =>
                parameters.map(([key, declared]) => [key, key === name ? text : declared]),
            );
        },

        getResultNode(field): ResultNodeModel {
            const result = resultAt(field);
            if (!result) return {field, fields: [], exists: false};
            ensureLinked();
            const schema = engine.get(root);
            const returned = isRecord(schema) && isRecord(schema['@return']) ? schema['@return'] : {};
            const label = result['@node-name'];
            return {
                field,
                label: typeof label === 'string' ? label : undefined,
                fields: Object.entries(result)
                    .filter(([name]) => !name.startsWith('@'))
                    .map(([name, value]) => ({name, type: typeText(returned[name]) ?? 'any', value: valueText(value)})),
                exists: true,
            };
        },

        createResultNode() {
            if (!serviceAt()) return failure(`'${root}' is not a service`);
            const body = contextAt(root);
            if (body?.['@kind'] !== 'context') return failure(`The body of '${root}' is not a context`);
            const field = childPath(root, RESULT_FIELD);
            const existing = body[RESULT_FIELD];
            if (isRecord(existing) && existing['@kind'] !== 'context') {
                return failure(`The result of '${root}' is not a record`);
            }
            // Without a `return` record the service returns every field of its body: the result starts with them,
            // so the callers keep reading what they read.
            const node = isRecord(existing)
                ? {...existing, '@node': RESULT_ANNOTATION}
                : {
                      '@kind': 'context',
                      ...Object.fromEntries(
                          Object.entries(body)
                              .filter(([key, value]) => !key.startsWith('@') && !declarationKind(value))
                              .map(([key]) => [key, {'@kind': 'expression', expression: key}]),
                      ),
                      '@node': RESULT_ANNOTATION,
                  };
            const written = setWithLinkCheck(
                engine,
                field,
                node as unknown as PortableNode,
                existing as PortableNode | undefined,
            );
            if (isPortableError(written)) return written;
            notify();
            return field;
        },

        bindResultField(field, name, sourcePath) {
            const result = resultAt(field);
            if (!result) return failure(`node '${field}' does not exist`);
            const text = bindingPath(field, sourcePath);
            if (name !== undefined && !(name in result)) return failure(`'${name}' does not exist`);
            const taken = new Set(Object.keys(result));
            const base = text.split('.').at(-1)!.replace(/\[.*$/, '');
            const target = name ?? uniqueName(IDENTIFIER.test(base) ? base : 'value', taken);
            const written = setWithLinkCheck(
                engine,
                `${field}.${target}`,
                text as unknown as PortableNode,
                result[target] as PortableNode | undefined,
            );
            if (isPortableError(written)) return written;
            notify();
        },

        renameResultField(field, from, to) {
            if (from === to) return;
            if (!IDENTIFIER.test(to)) return failure(`'${to}' is not a valid field name`);
            const result = resultAt(field);
            if (result && to in result) return failure(`'${to}' already exists`, 'DuplicateName');
            return editResult(field, (entries) =>
                entries.some(([key]) => key === from)
                    ? entries.map(([key, value]) => [key === from ? to : key, value])
                    : undefined,
            );
        },

        moveResultField(field, name, direction) {
            return editResult(field, (entries) => {
                const from = entries.findIndex(([key]) => key === name);
                const to = direction === 'up' ? from - 1 : from + 1;
                if (from < 0 || to < 0 || to >= entries.length) return undefined;
                const next = [...entries];
                [next[from], next[to]] = [next[to], next[from]];
                return next;
            });
        },

        removeResultField(field, name) {
            return editResult(field, (entries) => entries.filter(([key]) => key !== name));
        },

        setResultFieldValue(field, name, text) {
            const result = resultAt(field);
            if (!result) return failure(`node '${field}' does not exist`);
            if (!(name in result) || name.startsWith('@')) return failure(`'${name}' does not exist`);
            if (text.trim() === '') return failure('A value is required.');
            const written = setWithLinkCheck(
                engine,
                `${field}.${name}`,
                text as unknown as PortableNode,
                result[name] as PortableNode,
            );
            if (isPortableError(written)) return written;
            notify();
        },

        async readOutput(source) {
            const keys = source.split('.');
            let firstError: string | undefined;
            // The engine executes a field, not a path into its result: take the longest executable prefix, then walk.
            for (let length = keys.length; length > 0; length -= 1) {
                let value: unknown;
                try {
                    value = await engine.execute(keys.slice(0, length).join('.'));
                } catch (error) {
                    firstError ??=
                        error instanceof Error
                            ? error.message
                            : String((error as {message?: string})?.message ?? error);
                    continue;
                }
                for (const key of keys.slice(length)) {
                    value = isRecord(value) ? value[key] : undefined;
                }
                if (value === undefined) return {error: `no ${source}`};
                // An empty list has no item to show its fields: the declared type of the path names them.
                if (Array.isArray(value) && value.length === 0) return {value, ...declaredListType(source)};
                return {value, type: valueType(value)};
            }
            return {error: firstError ?? `no ${source}`};
        },

        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },

        invalidate() {
            notify();
        },
    };
}

// What a new input node of each kind holds: a record with one number field, a list of numbers, or one number.
const NEW_INPUT: Record<InputKind, {base: string; node: PortableNode}> = {
    'object-input': {
        base: 'input',
        node: {'@kind': 'context', '@node': 'InputNode', value: 0} as unknown as PortableNode,
    },
    'list-input': {
        base: 'list',
        node: {'@kind': 'expression', expression: '[1, 2, 3]', '@node': 'InputNode'} as unknown as PortableNode,
    },
    'value-input': {
        base: 'value',
        node: {'@kind': 'expression', expression: '0', '@node': 'InputNode'} as unknown as PortableNode,
    },
};

// Built-in types: a parameter of any other named type reads the fields of its type definition.
const PRIMITIVE_TYPES = new Set([
    'number',
    'string',
    'boolean',
    'date',
    'time',
    'datetime',
    'duration',
    'period',
    'any',
]);

const DECLARATION_KINDS: Record<string, InputDeclarationKind> = {
    function: 'function',
    ruleset: 'ruleset',
    optimise: 'optimisation',
    'type-definition': 'type',
};

// The declaration kind of a record field value; undefined for an ordinary value or nested record.
function declarationKind(value: unknown): InputDeclarationKind | undefined {
    return isRecord(value) && typeof value['@kind'] === 'string' ? DECLARATION_KINDS[value['@kind']] : undefined;
}

// The expression text of a record field value; undefined for a nested record, which has no single expression.
function valueText(value: unknown): string | undefined {
    if (declarationKind(value)) return undefined;
    return isRecord(value) && value['@kind'] === 'context' ? undefined : formatPortableValue(value);
}

function valueType(value: unknown): string {
    if (Array.isArray(value)) return `${value.length ? valueType(value[0]) : 'any'}[]`;
    if (value === null) return 'any';
    return typeof value === 'object' ? 'object' : typeof value;
}

// True when an expression anywhere in `node` reads `path`.
function readsPath(node: unknown, path: string): boolean {
    const pattern = new RegExp(`(?<![\\w.])${escapeRegExp(path)}\\b`);
    return pattern.test(JSON.stringify(node));
}

function unknownCallee(method: string): PortableError {
    return {
        '@kind': 'error',
        type: 'Execution',
        message: `'${method}' is not a function or ruleset`,
    } as PortableError;
}

function noCallee(field: string): PortableError {
    return {'@kind': 'error', type: 'Execution', message: `node '${field}' has no callee`} as PortableError;
}

function failure(message: string, type = 'Execution'): PortableError {
    return {'@kind': 'error', type, message} as PortableError;
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites the reads of member `from` of each field in `targets` to `to`: `<target>.<from>` in every expression text
 * of the model, and `<name>.<from>` (the short name of the target) in the context that holds the target.
 */
function rewriteMemberReads(root: unknown, targets: string[], from: string, to: string): unknown {
    let next = rewriteReads(root, targets, from, to, false);
    for (const target of targets) {
        const scope = parentPath(target) ?? '*';
        if (scope === '*') continue;
        const keys = contextKeys(next, scope);
        if (!keys) continue;
        const context = valueAt(next, keys);
        next = setAt(next, keys, rewriteReads(context, [target.slice(scope.length + 1)], from, to, true));
    }
    return next;
}

/**
 * Rewrites `<name>.<from>` to `<name>.<to>` in every expression text of `node` for each name. With `scoped`, `node` is
 * the context that defines the names: a nested context that defines one of them again shadows it, and a nested
 * function cannot read them, so neither is rewritten.
 */
function rewriteReads(node: unknown, names: string[], from: string, to: string, scoped: boolean, top = true): unknown {
    if (typeof node === 'string') {
        let text = node;
        for (const name of names) {
            text = text.replace(
                new RegExp(`(?<![\\w.])${escapeRegExp(name)}\\.${escapeRegExp(from)}\\b`, 'g'),
                `${name}.${to}`,
            );
        }
        return text;
    }
    if (Array.isArray(node)) return node.map((child) => rewriteReads(child, names, from, to, scoped, false));
    if (!isRecord(node)) return node;
    if (scoped && !top) {
        if (node['@kind'] === 'function') return node;
        const visible = node['@kind'] === 'context' ? names.filter((name) => !(name in node)) : names;
        if (visible.length === 0) return node;
        names = visible;
    }
    return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [key, rewriteReads(child, names, from, to, scoped, false)]),
    );
}

// Rewrites every read of the identifier `from` to `to` in the expression texts of `node`. A named argument label or a
// record key (`from:`) is not a read.
function renameIdentifier(node: unknown, from: string, to: string): unknown {
    if (typeof node === 'string') {
        return node.replace(new RegExp(`(?<![\\w.])${escapeRegExp(from)}\\b(?!\\s*:)`, 'g'), to);
    }
    if (Array.isArray(node)) return node.map((child) => renameIdentifier(child, from, to));
    if (!isRecord(node)) return node;
    // Metadata such as `@kind` or `@node` holds no expression; arguments and a function body do.
    return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [
            key,
            key.startsWith('@') && key !== '@arguments' && key !== '@body' ? child : renameIdentifier(child, from, to),
        ]),
    );
}

// Applies `edit` to the named arguments of every call of `method` in the model: an invocation, and a call in an
// expression text through `editText`.
function editCallArguments(
    node: unknown,
    method: string,
    edit: (args: [string, unknown][]) => [string, unknown][],
    editText: (text: string) => string,
): unknown {
    if (typeof node === 'string') return editText(node);
    if (Array.isArray(node)) return node.map((child) => editCallArguments(child, method, edit, editText));
    if (!isRecord(node)) return node;
    const next = Object.fromEntries(
        Object.entries(node).map(([key, child]) => [key, editCallArguments(child, method, edit, editText)]),
    );
    if (isInvocation(node) && node['@method'] === method && isRecord(next['@arguments'])) {
        next['@arguments'] = Object.fromEntries(edit(Object.entries(next['@arguments'])));
    }
    return next;
}

// `method(from: x)` becomes `method(to: x)` in every call of the model.
function renameCallArgument(model: unknown, method: string, from: string, to: string): unknown {
    return editCallArguments(
        model,
        method,
        (args) => args.map(([name, value]) => [name === from ? to : name, value]),
        (text) => renameNamedArgument(text, method, from, to),
    );
}

// The named argument `name` leaves every invocation of `method`; a call in an expression text keeps it, and the
// link check refuses the change.
function removeCallArgument(model: unknown, method: string, name: string): unknown {
    return editCallArguments(
        model,
        method,
        (args) => args.filter(([key]) => key !== name),
        (text) => text,
    );
}

// Renames the label `from:` of the top-level named arguments of each call of `method` in an expression text.
function renameNamedArgument(text: string, method: string, from: string, to: string): string {
    const call = new RegExp(`(?<![\\w.])${escapeRegExp(method)}\\s*\\(`, 'g');
    const label = new RegExp(`^(\\s*)${escapeRegExp(from)}(\\s*:)`);
    let out = '';
    let index = 0;
    for (let match = call.exec(text); match; match = call.exec(text)) {
        let at = match.index + match[0].length;
        out += text.slice(index, at);
        let depth = 0;
        let argumentStart = true;
        while (at < text.length) {
            const named = argumentStart && depth === 0 ? label.exec(text.slice(at)) : null;
            if (named) {
                out += `${named[1]}${to}${named[2]}`;
                at += named[0].length;
                argumentStart = false;
                continue;
            }
            const char = text[at];
            argumentStart = false;
            if ('([{'.includes(char)) depth += 1;
            else if (')]}'.includes(char)) {
                if (depth === 0) break;
                depth -= 1;
            } else if (char === ',' && depth === 0) argumentStart = true;
            out += char;
            at += 1;
        }
        index = at;
        call.lastIndex = at;
    }
    return out + text.slice(index);
}

// The fields that invoke `method`, by path; the fields of a function body are addressed through the function.
function invocationFields(node: unknown, method: string, path = ''): string[] {
    if (!isRecord(node)) return [];
    if (isInvocation(node)) return node['@method'] === method && path ? [path] : [];
    if (node['@kind'] === 'function') return invocationFields(node['@body'], method, path);
    return Object.entries(node).flatMap(([key, child]) =>
        key.startsWith('@') ? [] : invocationFields(child, method, path ? `${path}.${key}` : key),
    );
}

// The keys that lead to the field at `path` in the Portable tree: the fields of a function live in its '@body'.
function portableKeys(root: unknown, path: string): string[] {
    const keys: string[] = [];
    let node = root;
    for (const name of path.split('.')) {
        if (isRecord(node) && node['@kind'] === 'function') {
            keys.push('@body');
            node = node['@body'];
        }
        keys.push(name);
        node = isRecord(node) ? node[name] : undefined;
    }
    return keys;
}

// The keys of the context at `path`: the body of a function.
function contextKeys(root: unknown, path: string): string[] | undefined {
    const keys = portableKeys(root, path);
    const node = valueAt(root, keys);
    if (!isRecord(node)) return undefined;
    return node['@kind'] === 'function' ? [...keys, '@body'] : keys;
}

function valueAt(root: unknown, keys: string[]): unknown {
    let node = root;
    for (const key of keys) node = isRecord(node) ? node[key] : undefined;
    return node;
}

function setAt<T>(root: T, keys: string[], value: unknown): T {
    const next = structuredClone(root) as Record<string, unknown>;
    let current = next;
    for (const key of keys.slice(0, -1)) current = current[key] as Record<string, unknown>;
    current[keys.at(-1)!] = value;
    return next as T;
}

// Writes only the top-level entries that differ, then links; a failed link restores them. `set('*')` is avoided
// because it drops the root metadata and rejects a root optimisation (docs/engine-bug-reports.md).
function writeChangedEntries(
    engine: FlowEditorEngine,
    next: PortableRootContext,
    previous: PortableRootContext,
): PortableError | void {
    const before = previous as unknown as Record<string, unknown>;
    const after = next as unknown as Record<string, unknown>;
    const changed = Object.keys(after).filter(
        (key) => !key.startsWith('@') && JSON.stringify(after[key]) !== JSON.stringify(before[key]),
    );
    for (const key of changed) {
        const result = engine.set(key, after[key] as PortableNode);
        if (isPortableError(result)) {
            for (const restore of changed) engine.set(restore, before[restore] as PortableNode);
            return result;
        }
    }
    try {
        engine.link();
    } catch (linkError) {
        for (const restore of changed) engine.set(restore, before[restore] as PortableNode);
        return linkError as PortableError;
    }
}

function replaceAt(root: PortableRootContext, path: string, value: PortableNode): PortableRootContext {
    return setAt(root, portableKeys(root, path), value);
}
