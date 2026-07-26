import { isPortableError } from '../../../lib/portable';
import type { TestRow, TestSectionId } from '../../test-cases-service';
import type { MutableDecisionService, TestSubject } from '../tests-manager-types';

type PortableNodeLike = Record<string, unknown> & { '@kind'?: string };
type TypeDefinitionMap = Record<string, PortableNodeLike>;

function isRecord(value: unknown): value is PortableNodeLike {
  return typeof value === 'object' && value !== null;
}

interface Leaf {
  path: string;
  type: string;
}

// Root-level `@kind: 'type-definition'` entries from the `ALL` view — user-defined `type X: {...}`
// declarations are root-only, so no recursion is needed to collect them.
function collectTypeDefinitions(node: unknown): TypeDefinitionMap {
  const defs: TypeDefinitionMap = {};
  if (!isRecord(node)) return defs;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@') || !isRecord(value)) continue;
    if (value['@kind'] === 'type-definition') defs[key] = value;
  }
  return defs;
}

// Expands one type reference — a bare type-name string, a `{'@kind': 'type', type, items?}` typed
// value, or an inline `{'@kind': 'type-definition', ...fields}` record — into its leaf paths.
// A user-defined type name is resolved through `typeDefs` and expanded recursively (the engine does
// not resolve such paths itself); an array is never expanded regardless of its element type; a type
// name absent from `typeDefs` (a scalar, or simply unknown) becomes a single leaf.
function expandTypeRef(
  pathSoFar: readonly string[],
  ref: unknown,
  typeDefs: TypeDefinitionMap,
  into: Leaf[],
  seen: ReadonlySet<string>,
): void {
  const path = pathSoFar.join('.');

  if (typeof ref === 'string') {
    const typeDef = typeDefs[ref];
    if (typeDef && !seen.has(ref)) {
      expandTypeDefinitionFields(pathSoFar, typeDef, typeDefs, into, new Set([...seen, ref]));
      return;
    }
    into.push({ path, type: ref });
    return;
  }

  if (!isRecord(ref)) {
    into.push({ path, type: 'any' });
    return;
  }

  if (ref['@kind'] === 'type-definition') {
    expandTypeDefinitionFields(pathSoFar, ref, typeDefs, into, seen);
    return;
  }

  const typeName = typeof ref['type'] === 'string' ? (ref['type'] as string) : 'any';
  if (typeName === 'array') {
    into.push({ path, type: 'array' });
    return;
  }
  const typeDef = typeDefs[typeName];
  if (typeDef && !seen.has(typeName)) {
    expandTypeDefinitionFields(pathSoFar, typeDef, typeDefs, into, new Set([...seen, typeName]));
    return;
  }
  into.push({ path, type: typeName });
}

function expandTypeDefinitionFields(
  pathSoFar: readonly string[],
  typeDef: PortableNodeLike,
  typeDefs: TypeDefinitionMap,
  into: Leaf[],
  seen: ReadonlySet<string>,
): void {
  for (const [fieldName, fieldRef] of Object.entries(typeDef)) {
    if (fieldName.startsWith('@')) continue;
    expandTypeRef([...pathSoFar, fieldName], fieldRef, typeDefs, into, seen);
  }
}

// Recurses into `@kind: 'context'` nodes of the `'*'` subject's `ALL` view, classifying every
// `type`/`expression` leaf as an input (writable) or computed leaf. `function-schema`,
// `ruleset-schema`, `loop-schema`, `optimise`, and `type-definition` entries are subjects (or type
// sources) in their own right and contribute no row; neither does an opaque `invocation` call site
// — its leaves surface later, from a run result (see `flattenResult`).
function walkDataContext(
  node: unknown,
  pathSoFar: readonly string[],
  typeDefs: TypeDefinitionMap,
  inputs: Leaf[],
  computed: Leaf[],
): void {
  if (!isRecord(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@') || !isRecord(value)) continue;
    const kind = value['@kind'];
    const nextPath = [...pathSoFar, key];
    if (kind === 'context') {
      walkDataContext(value, nextPath, typeDefs, inputs, computed);
    } else if (kind === 'type') {
      if (value['writeOnly']) {
        expandTypeRef(nextPath, value, typeDefs, inputs, new Set());
      } else {
        expandTypeRef(nextPath, value, typeDefs, computed, new Set());
      }
    } else if (kind === 'expression') {
      const type = typeof value['type'] === 'string' ? (value['type'] as string) : 'any';
      expandTypeRef(nextPath, { '@kind': 'type', type, items: value['items'] }, typeDefs, computed, new Set());
    }
  }
}

function buildRows(inputs: Leaf[], computed: Leaf[]): TestRow[] {
  const rows: TestRow[] = [];
  const section = (leaves: Leaf[], id: TestSectionId) =>
    leaves.forEach((leaf, order) => rows.push({ path: leaf.path, section: id, order, type: leaf.type, present: true }));
  section(inputs, 'inputs');
  section(computed, 'validations');
  return rows;
}

// Derives `subject`'s rows straight from the engine schema: input rows from its writable leaves
// (typed holes for the `'*'` model subject, `@parameters` for a callable), computed rows from its
// computed leaves (data-context computed fields for `'*'`, `@return`/`@result` for a callable).
// Freshly derived computed rows always land in `validations` — a persisted promotion to
// `assertions` is preserved by `TestCasesService.syncRows`, not by this pure function.
export function deriveRows(service: MutableDecisionService, subject: TestSubject): TestRow[] {
  const allView = service.get('*', 'ALL');
  const typeDefs = isPortableError(allView) ? {} : collectTypeDefinitions(allView);

  const inputs: Leaf[] = [];
  const computed: Leaf[] = [];

  if (subject.kind === 'model') {
    if (!isPortableError(allView)) {
      walkDataContext(allView, [], typeDefs, inputs, computed);
    }
    return buildRows(inputs, computed);
  }

  const schema: unknown =
    subject.kind === 'optimise' ? service.get(subject.id, 'EXTERNAL_DEFINITIONS') : service.get(subject.id);
  if (isPortableError(schema) || !isRecord(schema)) return [];

  const parameters = schema['@parameters'];
  if (isRecord(parameters)) {
    for (const [name, paramRef] of Object.entries(parameters)) {
      expandTypeRef([name], paramRef, typeDefs, inputs, new Set());
    }
  }

  const returnRef = subject.kind === 'optimise' ? schema['@result'] : schema['@return'];
  if (returnRef !== undefined) {
    expandTypeRef([], returnRef, typeDefs, computed, new Set());
  }

  return buildRows(inputs, computed);
}

export interface RowRename {
  from: string;
  to: string;
}

// Best-effort rename detection between two consecutive `deriveRows` snapshots. Pairs a row that
// disappeared with a row that newly appeared only when it is the *unique* candidate in the same
// section with the same type — an ambiguous match (e.g. two same-typed fields renamed in the same
// batch) is left undetected and falls through to `TestCasesService.syncRows`'s existing
// delete+add behavior, since guessing wrong would silently misattribute one field's data to
// another. A `present: false` row (already flagged as deleted from a prior sync) is never treated
// as a rename source.
export function detectRenames(previousRows: TestRow[], derivedRows: TestRow[]): RowRename[] {
  const previousPaths = new Set(previousRows.map((row) => row.path));
  const derivedPaths = new Set(derivedRows.map((row) => row.path));

  const removed = previousRows.filter((row) => row.present && !derivedPaths.has(row.path));
  const added = derivedRows.filter((row) => !previousPaths.has(row.path));

  const removedByKey = new Map<string, TestRow[]>();
  for (const row of removed) {
    const key = `${row.section}:${row.type ?? ''}`;
    const bucket = removedByKey.get(key);
    if (bucket) bucket.push(row);
    else removedByKey.set(key, [row]);
  }

  const addedByKey = new Map<string, TestRow[]>();
  for (const row of added) {
    const key = `${row.section}:${row.type ?? ''}`;
    const bucket = addedByKey.get(key);
    if (bucket) bucket.push(row);
    else addedByKey.set(key, [row]);
  }

  const renames: RowRename[] = [];
  for (const [key, removedRows] of removedByKey) {
    if (removedRows.length !== 1) continue;
    const addedRows = addedByKey.get(key);
    if (!addedRows || addedRows.length !== 1) continue;
    renames.push({ from: removedRows[0].path, to: addedRows[0].path });
  }
  return renames;
}

// Flattens an `execute()` result into subject-relative leaf paths, the same way `deriveRows` flattens
// the schema: a plain nested object recurses field by field (dot-joined), an array is a leaf, and a
// scalar top-level result (a callable whose return type is a scalar) flattens to the single path `''`.
// This is how a `@kind: 'invocation'` call site's leaves — opaque to every `get` view — are discovered.
export function flattenResult(value: unknown, pathPrefix: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isRecord(value) && !Array.isArray(value)) {
    for (const [key, sub] of Object.entries(value)) {
      Object.assign(out, flattenResult(sub, [...pathPrefix, key]));
    }
    return out;
  }
  out[pathPrefix.join('.')] = value;
  return out;
}
