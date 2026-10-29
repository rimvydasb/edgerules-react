import {isRecord} from '#lib/portableUtils';
import type {ShellView} from './shell-types';

/** What a root path segment is; it picks the icon of the header and the views that can show it. */
export type ShellPathKind = 'context' | 'workbook' | 'function' | 'ruleset' | 'type' | 'field';

/** One breadcrumb item of a root path. */
export interface ShellPathSegment {
    name: string; // the field name
    path: string; // the fully qualified path of the field
    kind: ShellPathKind;
}

// The kind of a model entry. Only a context or a workbook has fields that a root path can address.
function pathKind(node: unknown): ShellPathKind {
    if (!isRecord(node)) return 'field';
    switch (node['@kind']) {
        case 'context':
            return node['@node'] === 'Workbook' ? 'workbook' : 'context';
        case 'function':
        case 'external-function':
            return 'function';
        case 'ruleset':
            return 'ruleset';
        case 'type-definition':
            return 'type';
        default:
            return 'field';
    }
}

/**
 * The segments of the longest prefix of `path` that is a valid root path of `model`: contexts and workbooks at any
 * position, and any other entity (a function, a ruleset, a type or a plain field) last only. An index, an annotation
 * or a missing field ends the walk.
 */
export function rootPathSegments(model: unknown, path: string): ShellPathSegment[] {
    if (path === '*' || path === '') return [];
    const segments: ShellPathSegment[] = [];
    let context = model;
    for (const name of path.split('.')) {
        if (name.includes('[') || name.startsWith('@') || !isRecord(context)) break;
        const child = context[name];
        if (child === undefined) break;
        const kind = pathKind(child);
        const segmentPath = segments.length === 0 ? name : `${segments.at(-1)!.path}.${name}`;
        segments.push({name, path: segmentPath, kind});
        // A function is atomic, and only a context has fields: the root path never goes below anything else.
        if (kind !== 'context' && kind !== 'workbook') break;
        context = child;
    }
    return segments;
}

/** `path` when it is a valid root path of `model`, otherwise its nearest valid ancestor; '*' at the latest. */
export function resolveRootPath(model: unknown, path: string): string {
    return rootPathSegments(model, path).at(-1)?.path ?? '*';
}

export function isRootPath(model: unknown, path: string): boolean {
    return resolveRootPath(model, path) === path;
}

/** What a root path is: the whole model ('*') or the kind of its last segment. */
export type ShellRootKind = 'model' | ShellPathKind;

/**
 * The views of each root path kind; the view switch, the view fallback and the Project Explorer routing all read it.
 * - Code and Boxed show every entity.
 * - Flow is the canvas of the Flow Component nodes of a context: the model, a workbook or another context. A function,
 *   a ruleset, a type and a plain field have no nodes.
 * - Tests are the tests of a callable: the model, a function or a ruleset. A function is a test subject only when
 *   every argument has a type (see `untypedParameters`).
 */
export const ROOT_VIEWS: Record<ShellRootKind, readonly ShellView[]> = {
    model: ['code', 'boxed', 'flow', 'tests'],
    workbook: ['code', 'boxed', 'flow'],
    context: ['code', 'boxed', 'flow'],
    function: ['code', 'boxed', 'tests'],
    ruleset: ['code', 'boxed', 'tests'],
    type: ['code', 'boxed'],
    field: ['code', 'boxed'],
};

export function rootKind(segments: ShellPathSegment[]): ShellRootKind {
    return segments.at(-1)?.kind ?? 'model';
}

/** The views of a root path, from `ROOT_VIEWS`. */
export function rootViews(segments: ShellPathSegment[]): readonly ShellView[] {
    return ROOT_VIEWS[rootKind(segments)];
}
