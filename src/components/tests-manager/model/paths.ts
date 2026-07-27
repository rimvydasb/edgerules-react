// Syntax of a subject-relative row path — dotted field names, each optionally carrying one or more
// zero-based array indexes: `application.applicant[0].creditLine[0].balance`. Indexes are how a
// grid row addresses one element of an array-typed field; `deriveRows` pre-generates the `[0]`
// element of every array, and the row menu's **Duplicate** produces the rest.

const SEGMENT_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d+\])*)$/;
const INDEX_PATTERN = /\[(\d+)\]/g;

export type PathSegment = string | number; // A field name, or an array index.

/** True when `path` addresses an array element — the precondition for duplicating a row. */
export function hasIndex(path: string): boolean {
  return path.includes('[');
}

/**
 * Canonical form of `path`, with every index reset to zero: `applicant[2].creditLine[1].balance` ->
 * `applicant[0].creditLine[0].balance`. Two paths share a canonical form exactly when they address
 * the same field of the same schema, so this is what a duplicated row is validated against — the
 * schema only ever describes element `[0]`.
 */
export function normalizeIndexes(path: string): string {
  return path.replace(INDEX_PATTERN, '[0]');
}

/**
 * `path` split into field names and numeric indexes: `applicant[0].name` -> `['applicant', 0,
 * 'name']`. Returns `undefined` for anything that is not a well-formed path, which is what makes a
 * typed path *syntactically* invalid (as opposed to unknown to the model).
 */
export function parsePathSegments(path: string): PathSegment[] | undefined {
  if (path === '') return [];
  const segments: PathSegment[] = [];
  for (const part of path.split('.')) {
    const match = SEGMENT_PATTERN.exec(part);
    if (!match) return undefined;
    segments.push(match[1]);
    for (const index of match[2].matchAll(INDEX_PATTERN)) {
      segments.push(Number(index[1]));
    }
  }
  return segments;
}

export function isValidPathSyntax(path: string): boolean {
  return parsePathSegments(path) !== undefined;
}

/** Number of segments in `path`, used to bind shallower input paths before deeper ones. */
export function pathDepth(path: string): number {
  return parsePathSegments(path)?.length ?? path.split('.').length;
}

/**
 * Every path `path` hangs off of, itself included: `a[0].b` -> `['a', 'a[0]', 'a[0].b']`. A path
 * that names an interior node (`applicant[0]`) is as addressable as a leaf, so the known-path
 * universe carries the prefixes too.
 */
export function pathPrefixes(path: string): string[] {
  if (path === '') return [''];
  const prefixes: string[] = [];
  let current = '';
  for (const part of path.split('.')) {
    const match = SEGMENT_PATTERN.exec(part);
    const name = match ? match[1] : part;
    current = current === '' ? name : `${current}.${name}`;
    prefixes.push(current);
    if (match) {
      for (const index of match[2].matchAll(INDEX_PATTERN)) {
        current = `${current}${index[0]}`;
        prefixes.push(current);
      }
    }
  }
  return prefixes;
}

/**
 * The canonical paths `paths` makes addressable — each path, every prefix of it, all with indexes
 * normalized to zero. Membership in this set is what the Path cell highlights against.
 */
export function collectKnownPaths(paths: Iterable<string>): Set<string> {
  const known = new Set<string>();
  for (const path of paths) {
    for (const prefix of pathPrefixes(path)) known.add(normalizeIndexes(prefix));
  }
  return known;
}

/**
 * Whether `path` addresses something the model declares. An empty universe (a subject whose schema
 * could not be read) accepts everything rather than painting every row red.
 */
export function isKnownPath(path: string, known: ReadonlySet<string>): boolean {
  if (known.size === 0) return true;
  if (!isValidPathSyntax(path)) return false;
  return known.has(normalizeIndexes(path));
}

/**
 * The path a **Duplicate** of `path` should take: its last (deepest) index bumped to the first
 * value not already used by a row — `applicant[0].creditLine[0].balance` ->
 * `applicant[0].creditLine[1].balance`. Duplicating the deepest index keeps the copy next to its
 * source; re-pointing it at another applicant is then a path edit away. Returns `undefined` when
 * `path` carries no index, which is why the action is only offered for indexed rows.
 */
export function nextDuplicatePath(path: string, taken: Iterable<string>): string | undefined {
  const lastIndex = path.lastIndexOf('[');
  if (lastIndex === -1) return undefined;
  const close = path.indexOf(']', lastIndex);
  if (close === -1) return undefined;

  const head = path.slice(0, lastIndex);
  const tail = path.slice(close + 1);
  const current = Number(path.slice(lastIndex + 1, close));
  if (!Number.isInteger(current)) return undefined;

  const used = new Set(taken);
  for (let next = current + 1; next < current + 1000; next += 1) {
    const candidate = `${head}[${next}]${tail}`;
    if (!used.has(candidate)) return candidate;
  }
  return undefined;
}
