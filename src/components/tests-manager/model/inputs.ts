import { parsePathSegments, pathDepth, type PathSegment } from './paths';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Container = Record<string, unknown> | unknown[];

// Reads `segment` out of `container`, creating the child the *next* segment needs when it isn't
// already there (or isn't of the right shape): an array when the next segment is an index, a plain
// object otherwise.
function descend(container: Container, segment: PathSegment, nextSegment: PathSegment): Container {
  const existing = Array.isArray(container)
    ? container[segment as number]
    : container[segment as string];
  const wantsArray = typeof nextSegment === 'number';
  if (wantsArray ? Array.isArray(existing) : isPlainObject(existing)) {
    return existing as Container;
  }
  const created: Container = wantsArray ? [] : {};
  if (Array.isArray(container)) container[segment as number] = created;
  else container[segment as string] = created;
  return created;
}

// Expands subject-relative paths into the nested value `execute()` expects: `credit.balance` ->
// `{credit: {balance: …}}`, `applicant[0].name` -> `{applicant: [{name: …}]}`. A dotted key passed
// literally binds nothing, so every segment becomes its own nesting level. Paths whose value is
// `undefined` (an empty cell) are omitted entirely — an absent field, not an explicit `undefined`.
//
// Shallower paths are applied first, so a list bound wholesale through its own row
// (`applicant` = `[{name: "Ann"}]`) is written before the indexed rows that address into it
// (`applicant[0].name`), and the more specific cell wins. Indexes the user left a gap in
// (`applicant[2]` with no `[0]`/`[1]` row filled) stay empty in the array the engine receives.
export function buildExecuteInput(valuesByPath: Record<string, unknown>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const entries = Object.entries(valuesByPath)
    .filter(([path, value]) => value !== undefined && path !== '')
    .sort(([a], [b]) => pathDepth(a) - pathDepth(b));

  for (const [path, value] of entries) {
    const segments = parsePathSegments(path);
    if (!segments || segments.length === 0) continue;
    let cursor: Container = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      cursor = descend(cursor, segments[i], segments[i + 1]);
    }
    const last = segments[segments.length - 1];
    if (Array.isArray(cursor)) cursor[last as number] = value;
    else cursor[last as string] = value;
  }
  return root;
}
