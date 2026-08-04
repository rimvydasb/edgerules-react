// '*' + 'credit.balance' -> 'credit.balance'; 'creditDecision' + 'approved' -> 'creditDecision.approved'.
// Derives the model-wide qualified path from a subject-relative one, for `DocumentationService`
// lookups and any other consumer that addresses paths model-wide.
export function qualifyPath(subjectId: string, path: string): string {
  if (subjectId === '*') return path;
  if (path === '') return subjectId;
  return `${subjectId}.${path}`;
}
