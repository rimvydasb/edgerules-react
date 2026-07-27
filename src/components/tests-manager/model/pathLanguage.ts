import type {
  CodeEditorCompletionResult,
  CodeEditorDiagnostic,
  CodeEditorService,
} from '../../code-editor/language/service';
import { isValidPathSyntax, normalizeIndexes, pathDepth } from './paths';

/**
 * The language service the Path cell edits against.
 *
 * A row path is *not* an EdgeRules expression in the model's own scope — it is subject-relative
 * (`credit.balance` under the `creditDecision` subject is that callable's parameter, not a root
 * field) and it is only ever a path, never arithmetic or a call. Handing the cell the engine's
 * `MutableDecisionService` therefore lints the path as if it were a whole model source, which
 * reports the first segment as an unknown reference — a false positive on every valid path — and
 * offers built-ins (`matchesPattern(…)`) that can never belong in a path.
 *
 * This service replaces both halves with path semantics: diagnostics that mark the first segment
 * the model does not declare, and completions drawn from the subject's own addressable paths. It
 * satisfies the same structural `CodeEditorService` contract, so the cell keeps its EdgeRules
 * syntax highlighting and everything else `CodeEditorCell` provides.
 */
export interface PathLanguageOptions {
  // Canonical (zero-indexed) paths the subject makes addressable — see `collectKnownPaths`.
  knownPaths: ReadonlySet<string>;
  // Paths other rows already occupy. Committing onto one is refused, so it is flagged while typing.
  takenPaths?: ReadonlySet<string>;
}

// Splits `path` into its dotted parts with the offset each one starts at, so a diagnostic can point
// at the offending segment rather than underlining the whole cell.
function partsWithOffsets(path: string): { part: string; from: number }[] {
  const parts: { part: string; from: number }[] = [];
  let from = 0;
  for (const part of path.split('.')) {
    parts.push({ part, from });
    from += part.length + 1; // + the '.' that separated them
  }
  return parts;
}

function unknownSegmentDiagnostic(
  path: string,
  knownPaths: ReadonlySet<string>,
): CodeEditorDiagnostic | undefined {
  let prefix = '';
  for (const { part, from } of partsWithOffsets(path)) {
    const parent = prefix;
    prefix = prefix === '' ? part : `${prefix}.${part}`;
    if (knownPaths.has(normalizeIndexes(prefix))) continue;
    return {
      from,
      to: path.length,
      severity: 'error',
      source: 'path',
      message:
        parent === ''
          ? `'${part}' is not declared by this test subject`
          : `'${part}' is not a field of '${parent}'`,
    };
  }
  return undefined;
}

export function createPathLanguageService(options: PathLanguageOptions): CodeEditorService {
  const { knownPaths, takenPaths } = options;

  return {
    diagnostics: (code: string): CodeEditorDiagnostic[] => {
      const path = code.trim();
      // An empty cell is mid-edit, not wrong: committing it simply reverts the row.
      if (path === '') return [];

      if (takenPaths?.has(path)) {
        return [
          {
            from: 0,
            to: code.length,
            severity: 'error',
            source: 'path',
            message: 'Another row already uses this path.',
          },
        ];
      }

      if (!isValidPathSyntax(path)) {
        return [
          {
            from: 0,
            to: code.length,
            severity: 'error',
            source: 'path',
            message: 'Not a valid path: expected field names separated by "." with optional [n] indexes.',
          },
        ];
      }

      // No universe to check against (a subject whose schema could not be read) — flag nothing
      // rather than paint every path red. Same rule as `isKnownPath`.
      if (knownPaths.size === 0) return [];

      const unknown = unknownSegmentDiagnostic(path, knownPaths);
      return unknown ? [unknown] : [];
    },

    completions: (code: string, pos: number): CodeEditorCompletionResult => {
      const typed = code.slice(0, pos);
      // Indexes the user typed (`applicant[2]`) are matched against the canonical `[0]` the schema
      // describes, then carried back into the suggestion, so completing under element 2 keeps it.
      const canonical = normalizeIndexes(typed);

      const options = [...knownPaths]
        .filter((path) => path !== '' && path !== canonical && path.startsWith(canonical))
        .map((path) => ({
          label: typed + path.slice(canonical.length),
          type: 'property',
        }))
        .sort((a, b) => pathDepth(a.label) - pathDepth(b.label) || a.label.localeCompare(b.label));

      // The whole cell is the completion range: a path is one token as far as the user is
      // concerned, and replacing it wholesale is what makes picking a deep leaf a single choice.
      return { from: 0, to: code.length, options };
    },
  };
}
