import type { PortableError, PortableNode, PortableRootContext } from '@edgerules/portable';
import { listCallables, type CallableSource } from '../../../lib/callables';
import { setWithLinkCheck, type LinkCheckService } from '../../../lib/linkCheck';
import { isPortableError } from '../../../lib/portable';
import { uniqueName } from '../../boxed-editor/commands/rowFactories';
import type { SignatureParameter } from '../../boxed-editor/boxed-editor-types';
import { isRecord, portableAtPath, typeText } from '../../boxed-editor/service/portable-utils';
import type { CalleeRef, FlowEditorService, FunctionNodeModel, NodeArgument, NodeResult } from '../flow-editor-types';

type GetFilter = 'FIELDS' | 'ALL' | 'EXTERNAL_DEFINITIONS';

/** Structural subset of `MutableDecisionService` that the flow editor service uses. */
export interface FlowEditorEngine extends CallableSource, LinkCheckService {
    get(path: string, filter?: GetFilter): PortableNode | PortableError;
    toPortable(): PortableRootContext;
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
            .map(([name, type]) => ({ name, type: typeText(type) ?? 'any', renamable: true }));
    }
    return [{ name: 'result', type: typeText(ret) ?? 'any', renamable: kind === 'ruleset' }];
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
    return { kind: PATH_PATTERN.test(text.trim()) ? 'path' : 'value', text };
}

function argumentTexts(node: Record<string, unknown>): Record<string, string> {
    const raw = node['@arguments'];
    const args: Record<string, string> = {};
    if (!isRecord(raw)) return args;
    for (const [name, value] of Object.entries(raw)) {
        if (typeof value === 'string') args[name] = value;
        else if (isRecord(value) && typeof value.expression === 'string') args[name] = value.expression;
        else if (value !== undefined) args[name] = JSON.stringify(value);
    }
    return args;
}

export function createFlowEditorService(engine: FlowEditorEngine): FlowEditorService {
    const drafts = new Map<string, InvocationState>();
    const errors = new Map<string, { parameter: string; message: string }>();
    const listeners = new Set<() => void>();

    const notify = () => {
        for (const listener of [...listeners]) listener();
    };

    // Schemas exist only for a linked model; a model that fails to link has no callees to offer.
    const ensureLinked = () => {
        try {
            engine.link();
        } catch {
            // The reads below return errors and are skipped.
        }
    };

    const readSchema = (ref: { path: string; kind: CalleeRef['kind'] }): CalleeSchema | undefined => {
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
            const schema = readSchema({ path: callable.path, kind: callable.kind });
            if (schema) schemas.push(schema);
        }
        return schemas;
    };

    const committedAt = (field: string): Record<string, unknown> | undefined => {
        const node = portableAtPath(engine.toPortable() as PortableNode, field);
        return isInvocation(node) ? node : undefined;
    };

    const stateOf = (field: string): InvocationState | undefined => {
        const draft = drafts.get(field);
        if (draft) return draft;
        const committed = committedAt(field);
        if (!committed) return undefined;
        return {
            method: typeof committed['@method'] === 'string' ? committed['@method'] : undefined,
            label: typeof committed['@node-name'] === 'string' ? committed['@node-name'] : undefined,
            args: argumentTexts(committed),
        };
    };

    const usedBy = (calleePath: string, parameter: string): boolean => {
        // The linked `ALL` view is a schema without the body; the authored definition has it.
        const definition = portableAtPath(engine.toPortable() as PortableNode, calleePath);
        if (!isRecord(definition)) return false;
        const { '@parameters': _parameters, ...rest } = definition;
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
            ...(state.label === undefined ? {} : { '@node-name': state.label }),
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

    return {
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
            const existing = new Set([...Object.keys(engine.toPortable()), ...drafts.keys()]);
            const field = uniqueName('node', existing);
            drafts.set(field, { args: {} });
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
            const error = commit(field, { method, label: previous?.label, args: kept });
            if (error) return error;
            notify();
        },

        bindArgument(field, parameter, sourcePath) {
            const state = stateOf(field);
            const callee = calleeOf(state?.method);
            if (!state || !callee) return noCallee(field);
            errors.delete(field);
            const error = commit(field, { ...state, args: { ...state.args, [parameter]: sourcePath } });
            if (error) {
                errors.set(field, { parameter, message: error.message });
                notify();
                return error;
            }
            notify();
        },

        unbindArgument(field, parameter) {
            const state = stateOf(field);
            if (!state) return;
            const { [parameter]: _removed, ...args } = state.args;
            errors.delete(field);
            // A required argument leaves the node a draft; the committed field stays in the model.
            commit(field, { ...state, args });
            notify();
        },

        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

function unknownCallee(method: string): PortableError {
    return {
        '@kind': 'error',
        type: 'Execution',
        message: `'${method}' is not a function or ruleset`,
    } as PortableError;
}

function noCallee(field: string): PortableError {
    return { '@kind': 'error', type: 'Execution', message: `node '${field}' has no callee` } as PortableError;
}
