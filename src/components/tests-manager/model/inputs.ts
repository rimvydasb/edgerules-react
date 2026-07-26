// '*' + 'credit.balance' -> 'credit.balance'; 'creditDecision' + 'approved' -> 'creditDecision.approved'.
// Derives the model-wide qualified path from a subject-relative one, for `DocumentationService`
// lookups and any other consumer that addresses paths model-wide.
export function qualifyPath(subjectId: string, path: string): string {
  if (subjectId === '*') return path;
  if (path === '') return subjectId;
  return `${subjectId}.${path}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Expands dotted subject-relative paths into the nested object `execute()` expects
// (`credit.balance` -> `{credit: {balance: ...}}`). A dotted key passed literally binds nothing, so
// every segment becomes its own nesting level. Paths whose value is `undefined` (an empty cell) are
// omitted entirely — an absent field, not an explicit `undefined`.
export function buildExecuteInput(valuesByPath: Record<string, unknown>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(valuesByPath)) {
    if (value === undefined) continue;
    const segments = path.split('.');
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      const existing = cursor[segment];
      cursor = isPlainObject(existing) ? existing : ((cursor[segment] = {}) as Record<string, unknown>);
    }
    cursor[segments[segments.length - 1]] = value;
  }
  return root;
}
