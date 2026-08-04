import { linter, type Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { CodeEditorDiagnostic, CodeEditorDiagnosticsService } from './service';

function asSafeIndex(value: number | undefined, length: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const normalized = Math.floor(value);
  if (normalized < 0) {
    return 0;
  }
  if (normalized > length) {
    return length;
  }
  return normalized;
}

function mapSeverity(severity?: string): Diagnostic['severity'] {
  if (severity === 'warning' || severity === 'info' || severity === 'error') {
    return severity;
  }
  return 'error';
}

/** Clamps engine diagnostics into valid CodeMirror document ranges. */
export function toCodeMirrorDiagnostics(
  code: string,
  diagnostics: CodeEditorDiagnostic[],
): Diagnostic[] {
  const length = code.length;

  return diagnostics.map((diagnostic) => {
    const from = asSafeIndex(diagnostic.from, length);
    const to = Math.max(from, asSafeIndex(diagnostic.to, length));

    return {
      from,
      to,
      message: diagnostic.message,
      severity: mapSeverity(diagnostic.severity),
      source: diagnostic.source,
    };
  });
}

/**
 * CodeMirror lint extension backed by the EdgeRules `diagnostics()` service. The service is read
 * through a getter so the extension survives service identity changes without reconfiguration.
 */
export function edgeRulesLint(
  getService: () => CodeEditorDiagnosticsService,
  options?: { delay?: number },
): Extension {
  return linter(
    (view) => {
      const code = view.state.doc.toString();
      return toCodeMirrorDiagnostics(code, getService().diagnostics(code));
    },
    { delay: options?.delay ?? 250 },
  );
}
