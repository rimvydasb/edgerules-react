/**
 * Structural contracts for the EdgeRules language service consumed by the editors.
 *
 * The dev builds of `@edgerules/web/mutable` and `@edgerules/node/mutable` expose static
 * `diagnostics()` / `completions()` on `MutableDecisionService`, so the class itself satisfies
 * `CodeEditorService` — pass it straight in. The shapes below are structural subsets of the
 * engine's `EditorDiagnostic` / `EditorCompletionResult`, declared locally so the components
 * keep no hard dependency on a specific engine package version.
 */

export interface CodeEditorDiagnostic {
  from: number;
  to: number;
  message: string;
  severity?: string;
  source?: string;
  code?: string;
}

export interface CodeEditorCompletion {
  label: string;
  type?: string;
  detail?: string;
}

export interface CodeEditorCompletionResult {
  from: number;
  to: number;
  options: CodeEditorCompletion[];
}

/** Diagnostics-only service (the original `CodeEditor` contract). */
export interface CodeEditorDiagnosticsService {
  diagnostics: (code: string) => CodeEditorDiagnostic[];
}

/**
 * Full language service. `completions` is optional so a diagnostics-only service keeps working;
 * when absent the editor falls back to no completion source.
 */
export interface CodeEditorService extends CodeEditorDiagnosticsService {
  completions?: (code: string, pos: number) => CodeEditorCompletionResult;
}

/**
 * Text placed around a cell's content to form a complete model before asking the language
 * service for diagnostics or completions, so a cell expression is analyzed in the scope of its
 * surrounding model (positions are mapped back into the cell automatically).
 */
export interface CodeEditorEmbedContext {
  prefix: string;
  suffix: string;
}

/** Narrows a full-model service to the view of a single embedded cell. */
export function embedService(
  service: CodeEditorService,
  context: CodeEditorEmbedContext,
): CodeEditorService {
  const { prefix, suffix } = context;

  const embedded: CodeEditorService = {
    diagnostics: (code) => {
      const cellFrom = prefix.length;
      const cellTo = cellFrom + code.length;
      return service
        .diagnostics(prefix + code + suffix)
        .filter((diagnostic) => diagnostic.to >= cellFrom && diagnostic.from <= cellTo)
        .map((diagnostic) => ({
          ...diagnostic,
          from: Math.max(0, Math.min(diagnostic.from - cellFrom, code.length)),
          to: Math.max(0, Math.min(diagnostic.to - cellFrom, code.length)),
        }));
    },
  };

  const completions = service.completions?.bind(service);
  if (completions) {
    embedded.completions = (code, pos) => {
      const cellFrom = prefix.length;
      const result = completions(prefix + code + suffix, pos + cellFrom);
      return {
        from: Math.max(0, Math.min(result.from - cellFrom, code.length)),
        to: Math.max(0, Math.min(result.to - cellFrom, code.length)),
        options: result.options,
      };
    };
  }

  return embedded;
}
