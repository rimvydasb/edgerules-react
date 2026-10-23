import {isRecord} from '#lib/portableUtils';

/** One breadcrumb item of a root path. */
export interface ShellPathSegment {
    name: string; // the field name
    path: string; // the fully qualified path of the field
    kind: 'context' | 'function';
}

/**
 * The segments of the longest prefix of `path` that is a valid root path of `model`: contexts at any position and a
 * function last only. An index, a plain value, a ruleset, a type or a missing field ends the walk.
 */
export function rootPathSegments(model: unknown, path: string): ShellPathSegment[] {
    if (path === '*' || path === '') return [];
    const segments: ShellPathSegment[] = [];
    let context = model;
    for (const name of path.split('.')) {
        if (name.includes('[') || name.startsWith('@') || !isRecord(context)) break;
        const child = context[name];
        if (!isRecord(child)) break;
        const segmentPath = segments.length === 0 ? name : `${segments.at(-1)!.path}.${name}`;
        if (child['@kind'] === 'function') {
            // A function is atomic: the root path never goes below it.
            segments.push({name, path: segmentPath, kind: 'function'});
            break;
        }
        if (child['@kind'] !== 'context') break;
        segments.push({name, path: segmentPath, kind: 'context'});
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
