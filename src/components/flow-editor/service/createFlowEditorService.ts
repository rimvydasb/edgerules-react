import type {PortableError, PortableNode, PortableRootContext} from '@edgerules/portable';
import {listCallables, type CallableSource} from '../../../lib/callables';
import {setWithLinkCheck, type LinkCheckService} from '../../../lib/linkCheck';
import {isPortableError} from '../../../lib/portable';
import {
    addArgument as addFunctionArgument,
    addConditionColumn,
    moveArgument as moveFunctionArgument,
    moveConditionColumn,
    removeArgument as removeFunctionArgument,
    removeConditionColumn,
    renameArgument as renameFunctionArgument,
    renameConditionColumn,
    renameActionColumn,
    uniqueName,
} from '../../boxed-editor/commands/rowFactories';
import type {BoxedTableRowData, SignatureParameter} from '../../boxed-editor/boxed-editor-types';
import {createBoxedEditorService} from '../../boxed-editor/service/createBoxedEditorService';
import {denormalize} from '../../boxed-editor/service/denormalize';
import {isRecord, parentPath, portableAtPath, typeText} from '../../boxed-editor/service/portable-utils';
import type {FlowEditorService} from '../flow-editor-types';
import type {CalleeRef, FunctionNodeModel, NodeArgument, NodeResult} from '../function-node/types';
import type {InputField, InputNodeModel} from '../input-node/types';

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
    return [{name: 'result', type: typeText(ret) ?? 'any', renamable: kind === 'ruleset'}];
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
    const boxed = createBoxedEditorService(engine as never);
    const drafts = new Map<string, InvocationState>();
    const errors = new Map<string, {parameter: string; message: string}>();
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

    // The record at `field` when it is annotated `@node: 'InputNode'`.
    const inputAt = (field: string): Record<string, unknown> | undefined => {
        const node = portableAtPath(engine.toPortable() as PortableNode, field);
        return isRecord(node) && node['@kind'] === 'context' && node['@node'] === 'InputNode' ? node : undefined;
    };

    // Rewrites the fields of an input record in one link-checked write; the annotations stay.
    const editInput = (
        field: string,
        edit: (entries: [string, unknown][]) => [string, unknown][] | undefined,
    ): PortableError | void => {
        const input = inputAt(field);
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

    const siblingNames = (field: string): Set<string> => {
        const parent = parentPath(field);
        const siblings =
            parent && parent !== '*'
                ? portableAtPath(engine.toPortable() as PortableNode, parent)
                : engine.toPortable();
        return new Set([...(isRecord(siblings) ? Object.keys(siblings) : []), ...drafts.keys()]);
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
            const error = commit(field, {...state, args: {...state.args, [parameter]: sourcePath}});
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
            const input = inputAt(field);
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
            const parent = parentPath(field);
            const siblings =
                parent && parent !== '*'
                    ? portableAtPath(engine.toPortable() as PortableNode, parent)
                    : engine.toPortable();
            if (newName === field.split('.').at(-1)) return;
            if ((isRecord(siblings) && newName in siblings) || drafts.has(newName)) {
                return failure(`'${newName}' already exists`, 'DuplicateName');
            }
            const draft = drafts.get(field);
            if (draft && !committedAt(field)) {
                drafts.delete(field);
                drafts.set(newName, draft);
            } else {
                boxed.invalidate(field);
                const error = boxed.rename(field, newName);
                if (error) return error;
                const moved = drafts.get(field);
                if (moved) {
                    drafts.delete(field);
                    drafts.set(newName, moved);
                }
                if (errors.has(field)) {
                    errors.set(newName, errors.get(field)!);
                    errors.delete(field);
                }
            }
            notify();
        },

        duplicate(field) {
            const input = inputAt(field);
            if (input) {
                const base = field.split('.').at(-1)!;
                const parent = parentPath(field);
                const name = uniqueName(base, siblingNames(field));
                const copy = parent && parent !== '*' ? `${parent}.${name}` : name;
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
            const parent = parentPath(field);
            const siblings =
                parent && parent !== '*'
                    ? portableAtPath(engine.toPortable() as PortableNode, parent)
                    : engine.toPortable();
            const names = new Set([...(isRecord(siblings) ? Object.keys(siblings) : []), ...drafts.keys()]);
            const base = field.split('.').at(-1)!;
            const name = uniqueName(base, names);
            const copy = parent && parent !== '*' ? `${parent}.${name}` : name;
            const error = commit(copy, {...state, args: {...state.args}});
            if (error) return error;
            notify();
            return copy;
        },

        removeFromFlow(field) {
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
            const draftOnly = drafts.has(field) && !committedAt(field);
            drafts.delete(field);
            errors.delete(field);
            if (draftOnly) {
                notify();
                return;
            }
            const previous = (committedAt(field) ?? inputAt(field)) as PortableNode | undefined;
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
            const migrated = rewriteResultReferences(renamed, callers, from, to) as PortableRootContext;
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

        getInputNode(field): InputNodeModel {
            const input = inputAt(field);
            if (!input) return {field, fields: []};
            ensureLinked();
            const schema = engine.get(field, 'FIELDS');
            const fields: InputField[] = isRecord(schema)
                ? Object.entries(schema)
                      .filter(([name]) => !name.startsWith('@'))
                      .map(([name, type]) => ({
                          name,
                          type: typeText(type) ?? 'object',
                          used: readsField(engine.toPortable(), field, name),
                      }))
                : [];
            const label = input['@node-name'];
            return {field, label: typeof label === 'string' ? label : undefined, fields};
        },

        listInputCandidates() {
            const candidates: string[] = [];
            const walk = (node: unknown, path: string) => {
                if (!isRecord(node)) return;
                for (const [key, child] of Object.entries(node)) {
                    if (key.startsWith('@') || !isRecord(child) || child['@kind'] !== 'context') continue;
                    const childPath = path ? `${path}.${key}` : key;
                    if (child['@node'] === undefined) candidates.push(childPath);
                    walk(child, childPath);
                }
            };
            walk(engine.toPortable(), '');
            return candidates;
        },

        addInputNode(field) {
            const node = portableAtPath(engine.toPortable() as PortableNode, field);
            if (!isRecord(node) || node['@kind'] !== 'context') return failure(`'${field}' is not a record`);
            const result = setWithLinkCheck(
                engine,
                field,
                {...node, '@node': 'InputNode'} as unknown as PortableNode,
                node as unknown as PortableNode,
            );
            if (isPortableError(result)) return result;
            notify();
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
            const input = inputAt(field);
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
            const next = rewriteResultReferences(
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

        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

// True when an expression anywhere in the model reads `<field>.<name>`.
function readsField(root: unknown, field: string, name: string): boolean {
    const pattern = new RegExp(`(?<![\\w.])${escapeRegExp(`${field}.${name}`)}\\b`);
    return pattern.test(JSON.stringify(root));
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

// Rewrites `<caller>.<from>` to `<caller>.<to>` in every expression text of the model.
function rewriteResultReferences(node: unknown, callers: string[], from: string, to: string): unknown {
    if (typeof node === 'string') {
        let text = node;
        for (const caller of callers) {
            text = text.replace(
                new RegExp(`(?<![\\w.])${escapeRegExp(caller)}\\.${escapeRegExp(from)}\\b`, 'g'),
                `${caller}.${to}`,
            );
        }
        return text;
    }
    if (Array.isArray(node)) return node.map((child) => rewriteResultReferences(child, callers, from, to));
    if (!isRecord(node)) return node;
    return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [key, rewriteResultReferences(child, callers, from, to)]),
    );
}

function invocationFields(node: unknown, method: string, path = ''): string[] {
    if (!isRecord(node)) return [];
    if (isInvocation(node)) return node['@method'] === method && path ? [path] : [];
    return Object.entries(node).flatMap(([key, child]) =>
        key.startsWith('@') ? [] : invocationFields(child, method, path ? `${path}.${key}` : key),
    );
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
    const next = structuredClone(root) as unknown as Record<string, unknown>;
    const keys = path.split('.');
    let current = next;
    for (const key of keys.slice(0, -1)) current = current[key] as Record<string, unknown>;
    current[keys.at(-1)!] = value;
    return next as unknown as PortableRootContext;
}
