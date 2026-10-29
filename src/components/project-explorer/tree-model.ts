import type {PortableContext, PortableNode} from '@edgerules/portable';
import {untypedParameters} from '#lib/callables';

/** Literal `get()` argument for the root context. */
export const ROOT_FETCH_PATH = '*';

/** The six sections of the explorer, in display order. */
export type ExplorerSection = 'types' | 'methods' | 'services' | 'variables' | 'workbooks' | 'tests';

/** What an entry is: it picks the icon of the row and the editor the host opens for it. */
export type ExplorerEntryKind =
    | 'type'
    | 'function'
    | 'service'
    | 'ruleset'
    | 'context'
    | 'variable'
    | 'workbook'
    | 'input-node'
    | 'function-node'
    | 'output-node'
    | 'chart-node'
    | 'node'
    | 'test';

export interface ExplorerEntry {
    kind: ExplorerEntryKind;
    path: string; // the fully qualified model path; the test subject ID for a test
    label: string;
    children?: ExplorerEntry[]; // the nodes of a workbook
    untypedArguments?: string[]; // a generic function: the arguments without a type, which keep it from being tested
}

export type ExplorerSections = Record<ExplorerSection, ExplorerEntry[]>;

/** `@node` of a context that is a workbook. */
export const WORKBOOK_ANNOTATION = 'Workbook';
/** `@node` of a function that is a service method. */
export const SERVICE_ANNOTATION = 'Service';

const NODE_KINDS: Record<string, ExplorerEntryKind> = {
    InputNode: 'input-node',
    FunctionNode: 'function-node',
    RulesetNode: 'function-node',
    OutputNode: 'output-node',
    ChartNode: 'chart-node',
};

function isRecord(node: unknown): node is Record<string, unknown> {
    return node !== null && typeof node === 'object' && !Array.isArray(node);
}

// Widened to `string | undefined`: the engine's default filter returns `'function-schema'` and `'ruleset-schema'`
// for callables (see API_SPEC.md), shapes that are not part of the declared `PortableNode` union.
function kindOf(node: Record<string, unknown>): string | undefined {
    return node['@kind'] as string | undefined;
}

/** The method kind of a callable field, or undefined when the field is not callable. */
export function methodKind(node: unknown): 'function' | 'service' | 'ruleset' | undefined {
    if (!isRecord(node)) return undefined;
    const kind = kindOf(node);
    if (kind === 'function' || kind === 'function-schema' || kind === 'external-function') {
        return node['@node'] === SERVICE_ANNOTATION ? 'service' : 'function';
    }
    if (kind === 'ruleset' || kind === 'ruleset-schema') return 'ruleset';
    return undefined;
}

function isContext(node: unknown): node is Record<string, unknown> {
    if (!isRecord(node)) return false;
    const kind = kindOf(node);
    return kind === undefined || kind === 'context';
}

export function isWorkbook(node: unknown): boolean {
    return isContext(node) && node['@node'] === WORKBOOK_ANNOTATION;
}

export function joinPath(parentPath: string, name: string): string {
    return parentPath === '' ? name : `${parentPath}.${name}`;
}

// The own fields of a context. A `.` never appears in an identifier (EBNF.md), so a dotted key is a projection
// artifact of the engine, not a field.
function fields(context: Record<string, unknown>): [string, PortableNode][] {
    return Object.entries(context)
        .filter(([name, value]) => !name.startsWith('@') && !name.includes('.') && value !== undefined)
        .map(([name, value]) => [name, value as PortableNode]);
}

// A callable reads as a call, as in the Shell breadcrumbs: `name(...)` when it has arguments, `name()` when it has none.
function methodLabel(path: string, node: Record<string, unknown>): string {
    const parameters = node['@parameters'];
    return isRecord(parameters) && Object.keys(parameters).length > 0 ? `${path}(...)` : `${path}()`;
}

// Every callable of a context, at any depth: the services in `services`, the other callables in `methods`. A function is
// atomic and a workbook holds nodes, not methods.
function collectMethods(
    contextPath: string,
    context: Record<string, unknown>,
    methods: ExplorerEntry[],
    services: ExplorerEntry[],
): void {
    for (const [name, node] of fields(context)) {
        const path = joinPath(contextPath, name);
        const kind = methodKind(node);
        if (kind) {
            const untypedArguments = untypedParameters(node);
            (kind === 'service' ? services : methods).push({
                kind,
                path,
                label: methodLabel(path, node as Record<string, unknown>),
                ...(untypedArguments.length > 0 && {untypedArguments}),
            });
        } else if (isContext(node) && !isWorkbook(node)) collectMethods(path, node, methods, services);
    }
}

// The Flow Component nodes of a workbook: its direct fields with an `@node` annotation that ends with `Node`.
function workbookNodes(workbookPath: string, workbook: Record<string, unknown>): ExplorerEntry[] {
    return fields(workbook)
        .filter(([, node]) => isRecord(node) && typeof node['@node'] === 'string' && node['@node'].endsWith('Node'))
        .map(([name, node]) => ({
            kind: NODE_KINDS[(node as Record<string, unknown>)['@node'] as string] ?? 'node',
            path: joinPath(workbookPath, name),
            label: name,
        }));
}

/** The label of the root workbook: the model root when no context has `@Workbook` but the root has nodes. */
export const ROOT_WORKBOOK_LABEL = 'Model';

function byLabel(a: ExplorerEntry, b: ExplorerEntry): number {
    if (a.path === '*' || b.path === '*') return a.path === '*' ? -1 : 1;
    return a.label.localeCompare(b.label);
}

/**
 * Splits the model into the explorer sections, each sorted by name:
 * - **Types**: the type definitions of the root.
 * - **Methods**: every function and ruleset, also inside contexts, by qualified path: `path(...)` when it has
 *   arguments, `path()` when it has none.
 * - **Services**: every function with `@Service`, labelled like a method.
 * - **Variables**: every other root field, contexts included.
 * - **Workbooks**: every root context with `@Workbook`, with its nodes as children. A model without a `@Workbook`
 *   context but with nodes on the root is one workbook: the root ('*'), and its nodes are not variables.
 * - **Tests**: every test subject that has tests, labelled as its method.
 */
export function buildSections(
    model: PortableContext,
    types: PortableContext | undefined,
    testSubjects: readonly string[],
): ExplorerSections {
    const sections: ExplorerSections = {
        types: [],
        methods: [],
        services: [],
        variables: [],
        workbooks: [],
        tests: [],
    };

    for (const [name] of types ? fields(types) : []) {
        sections.types.push({kind: 'type', path: name, label: name});
    }
    collectMethods('', model, sections.methods, sections.services);
    const hasWorkbook = fields(model).some(([, node]) => isWorkbook(node));
    const rootNodes = hasWorkbook ? [] : workbookNodes('', model);
    if (rootNodes.length > 0) {
        sections.workbooks.push({
            kind: 'workbook',
            path: ROOT_FETCH_PATH,
            label: ROOT_WORKBOOK_LABEL,
            children: rootNodes,
        });
    }
    const rootNodePaths = new Set(rootNodes.map((entry) => entry.path));
    for (const [name, node] of fields(model)) {
        if (methodKind(node) || rootNodePaths.has(name)) continue;
        if (isWorkbook(node)) {
            const children = workbookNodes(name, node as Record<string, unknown>);
            sections.workbooks.push({kind: 'workbook', path: name, label: name, children});
        } else {
            sections.variables.push({kind: isContext(node) ? 'context' : 'variable', path: name, label: name});
        }
    }
    const methodLabels = new Map(
        [...sections.methods, ...sections.services].map((entry) => [entry.path, entry.label]),
    );
    for (const subjectId of testSubjects) {
        const label = subjectId === '*' ? 'Model' : (methodLabels.get(subjectId) ?? `${subjectId}()`);
        sections.tests.push({kind: 'test', path: subjectId, label});
    }
    // The engine projection does not keep the source order: a section lists its entries by name, the model test first.
    for (const entries of Object.values(sections)) entries.sort(byLabel);
    return sections;
}

/** An EdgeRules identifier (EBNF.md): a letter or `_`, then letters, digits or `_`. */
export function isIdentifier(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}
