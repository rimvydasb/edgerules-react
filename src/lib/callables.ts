import type {PortableError, PortableNode} from '@edgerules/portable';
import {isPortableError} from './portable';

export type CallableKind = 'function' | 'ruleset' | 'optimise' | 'loop';

export interface Callable {
    path: string; // Dotted path, for example 'risk' or 'library.eligibility'.
    kind: CallableKind;
}

/** Structural subset of `MutableDecisionService` that `listCallables` reads. */
export interface CallableSource {
    get(path: string, filter?: 'ALL' | 'EXTERNAL_DEFINITIONS'): PortableNode | PortableError;
}

type PortableNodeLike = Record<string, unknown> & {'@kind'?: string};

function isRecord(value: unknown): value is PortableNodeLike {
    return typeof value === 'object' && value !== null;
}

// The engine reports an untyped callable parameter as the bare string `"any"` in a schema view.
// A row with no declared type has no parsing rule, so such a callable is not listed.
function hasOnlyTypedParameters(parameters: unknown): boolean {
    if (!isRecord(parameters)) return true;
    return Object.values(parameters).every((param) => param !== 'any');
}

const SCHEMA_KINDS: Record<string, CallableKind> = {
    'function-schema': 'function',
    'ruleset-schema': 'ruleset',
    'loop-schema': 'loop',
};

// Recurses into `@kind: 'context'` nodes only — never into a `@body` — so a callable declared
// inside another callable's body is never reached: `get('*', 'ALL')` doesn't expose bodies at all.
function walkCallables(node: unknown, path: readonly string[], into: Callable[]): void {
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
        if (key.startsWith('@') || !isRecord(value)) continue;
        const kind = value['@kind'];
        if (kind === 'context') {
            walkCallables(value, [...path, key], into);
        } else if (kind !== undefined && kind in SCHEMA_KINDS && hasOnlyTypedParameters(value['@parameters'])) {
            into.push({path: [...path, key].join('.'), kind: SCHEMA_KINDS[kind]});
        }
    }
}

// `optimise` declarations are root-only and absent from `FIELDS`/`ALL` entirely — their catalog
// row (the one carrying `@result`) lives only in the `EXTERNAL_DEFINITIONS` view.
function collectOptimise(node: unknown): Callable[] {
    const callables: Callable[] = [];
    if (!isRecord(node)) return callables;
    for (const [key, value] of Object.entries(node)) {
        if (key.startsWith('@') || !isRecord(value)) continue;
        if (value['@kind'] === 'optimise' && hasOnlyTypedParameters(value['@parameters'])) {
            callables.push({path: key, kind: 'optimise'});
        }
    }
    return callables;
}

/**
 * Every fully typed user callable — `func`/`ruleset`/`loop` at any context depth (the `ALL` view)
 * and `optimise` (the `EXTERNAL_DEFINITIONS` view). A callable that declares any untyped
 * parameter is excluded.
 */
export function listCallables(service: CallableSource): Callable[] {
    const callables: Callable[] = [];

    const allView = service.get('*', 'ALL');
    if (!isPortableError(allView)) walkCallables(allView, [], callables);

    const externalView = service.get('*', 'EXTERNAL_DEFINITIONS');
    if (!isPortableError(externalView)) callables.push(...collectOptimise(externalView));

    return callables;
}
