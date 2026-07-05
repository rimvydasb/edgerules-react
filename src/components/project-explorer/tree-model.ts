import type { PortableContext, PortableInvocationDefinition, PortableNode } from '@edgerules/portable';

export type FieldKind = 'ctx' | 'func' | 'dt' | 'var';

/** The four reserved decision-table hit-policy keywords (story doc rule 5). */
export const HIT_POLICY_METHODS = new Set(['firstMatch', 'uniqueMatch', 'collectMatches', 'bestMatch']);

/** Literal `get()` argument for the root context — not a public path value (see ROOT_PATH). */
export const ROOT_FETCH_PATH = '*';

/** Public path convention for the root context, used in click callbacks and joined child paths. */
export const ROOT_PATH = '';

/**
 * Classifies a context field per the story doc's icon rules. A field is `[dt]` only when it's an
 * invocation whose `@method` is one of the four reserved hit-policy keywords; any other invocation
 * (a plain user-function call) falls back to `[vars]`, same as any other computed field.
 */
export function classifyFieldNode(node: PortableNode): FieldKind {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return 'var';
  }
  // Widened to `string | undefined`: the real engine's default CONTEXT filter returns
  // `'function-schema'` for function fields (see EDGERULES_API_SPEC.md), a shape that isn't part
  // of the declared `PortableNode` union — comparing the narrower type directly would make some
  // of the branches below unreachable per the type checker even though they occur at runtime.
  const kind = ('@kind' in node ? node['@kind'] : undefined) as string | undefined;

  if (kind === undefined || kind === 'context') {
    return 'ctx';
  }
  if (kind === 'function' || kind === 'function-schema') {
    return 'func';
  }
  if (kind === 'invocation') {
    return HIT_POLICY_METHODS.has((node as PortableInvocationDefinition)['@method']) ? 'dt' : 'var';
  }
  return 'var';
}

export interface NamedEntry {
  name: string;
  path: string;
  node: PortableNode;
  kind: FieldKind;
}

/**
 * Splits a context's own fields into the `[vars]` group and the `ordered` ctx/func/dt entries,
 * the latter kept interleaved in source/document order (story doc rule 6 — ctx/func/dt are not
 * separately grouped by sub-kind, only vars/types are pulled out as their own groups).
 */
export function groupContextChildren(
  contextPath: string,
  context: PortableContext,
): { vars: NamedEntry[]; ordered: NamedEntry[] } {
  const vars: NamedEntry[] = [];
  const ordered: NamedEntry[] = [];

  for (const [name, value] of Object.entries(context)) {
    if (name.startsWith('@') || value === undefined || name.includes('.')) {
      // A `.` can never appear in an EdgeRules identifier (EBNF.md), so a dotted key is never a
      // genuine same-level field — the current engine's CONTEXT projection sometimes flattens a
      // descendant function schema onto an ancestor context as a dotted-path key (e.g. `nested.deep`
      // alongside `nested` itself); skip it here rather than render it as a false sibling.
      continue;
    }
    // Metadata (`@`-prefixed) keys are the only string|number-valued entries on PortableContext;
    // everything else is a PortableNode.
    const node = value as PortableNode;
    const kind = classifyFieldNode(node);
    const entry: NamedEntry = { name, path: joinPath(contextPath, name), node, kind };
    (kind === 'var' ? vars : ordered).push(entry);
  }

  return { vars, ordered };
}

export function joinPath(parentPath: string, name: string): string {
  return parentPath === ROOT_PATH ? name : `${parentPath}.${name}`;
}

export interface TypeEntry {
  name: string;
  node: PortableNode;
}

/**
 * Lists the entries of a `get(ROOT_FETCH_PATH, 'TYPE_DEFINITIONS')` result (a `PortableContext`
 * whose fields are each a type-definition or typed-value entry — see EDGERULES_API_SPEC.md).
 * Types are global/root-only (story doc: `[types]` renders once, at the root, never per-context).
 */
export function listTypeEntries(rootTypes: PortableContext): TypeEntry[] {
  return Object.entries(rootTypes)
    .filter(([name, value]) => !name.startsWith('@') && value !== undefined)
    .map(([name, value]) => ({ name, node: value as PortableNode }));
}
