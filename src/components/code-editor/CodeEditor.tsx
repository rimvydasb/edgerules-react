import { useEffect, useRef, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { EditorState } from '@codemirror/state';
import { forceLinting, linter, type Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';

export interface CodeEditorDiagnostic {
  from: number;
  to: number;
  message: string;
  severity?: string;
}

export interface CodeEditorDiagnosticsService {
  diagnostics: (code: string) => CodeEditorDiagnostic[];
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  service: CodeEditorDiagnosticsService;
  readOnly?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
}

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

function mapDiagnostics(code: string, diagnostics: CodeEditorDiagnostic[]): Diagnostic[] {
  const length = code.length;

  return diagnostics.map((diagnostic) => {
    const from = asSafeIndex(diagnostic.from, length);
    const to = Math.max(from, asSafeIndex(diagnostic.to, length));

    return {
      from,
      to,
      message: diagnostic.message,
      severity: mapSeverity(diagnostic.severity),
    };
  });
}

/**
 * A controlled EdgeRules code editor powered by CodeMirror.
 * Validation is delegated to the provided EdgeRules diagnostics service.
 */
export function CodeEditor({
  value,
  onChange,
  service,
  readOnly = false,
  className,
  sx,
}: CodeEditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const serviceRef = useRef(service);
  const onChangeRef = useRef(onChange);
  const syncingFromPropRef = useRef(false);

  useEffect(() => {
    serviceRef.current = service;
    if (viewRef.current) {
      forceLinting(viewRef.current);
    }
  }, [service]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          EditorView.lineWrapping,
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || syncingFromPropRef.current) {
              return;
            }
            onChangeRef.current(update.state.doc.toString());
          }),
          linter(
            (editorView) => {
              const code = editorView.state.doc.toString();
              return mapDiagnostics(code, serviceRef.current.diagnostics(code));
            },
            { delay: 0 },
          ),
        ],
      }),
    });

    viewRef.current = view;
    forceLinting(view);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();
    if (currentValue === value) {
      return;
    }

    syncingFromPropRef.current = true;
    view.dispatch({
      changes: { from: 0, to: currentValue.length, insert: value },
    });
    syncingFromPropRef.current = false;
  }, [value]);

  return (
    <Box
      className={className}
      sx={{
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        overflow: 'hidden',
        '& .cm-editor': {
          minHeight: 180,
          fontFamily: 'monospace',
          fontSize: '0.9rem',
        },
        '& .cm-scroller': {
          minHeight: 180,
        },
        ...sx,
      }}
    >
      <div ref={hostRef} />
    </Box>
  );
}
