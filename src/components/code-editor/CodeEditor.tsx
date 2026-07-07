import { useEffect, useRef, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { EditorState } from '@codemirror/state';
import { forceLinting } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { edgeRulesExtensions } from './language/extensions';
import type { CodeEditorService } from './language/service';

export type {
  CodeEditorDiagnostic,
  CodeEditorDiagnosticsService,
  CodeEditorService,
} from './language/service';

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * EdgeRules language service — the dev builds of `MutableDecisionService` (from
   * `@edgerules/web/mutable` or `@edgerules/node/mutable`) satisfy this directly. Diagnostics
   * power lint markers; `completions` (when present) powers Ctrl+Space suggestions.
   */
  service: CodeEditorService;
  readOnly?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
}

/**
 * A controlled EdgeRules code editor powered by CodeMirror: DSL syntax highlighting,
 * engine-backed diagnostics and completions (Ctrl+Space), Ctrl+Click / F12 go-to-definition,
 * and Shift-Alt-F document formatting.
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
          EditorState.readOnly.of(readOnly),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || syncingFromPropRef.current) {
              return;
            }
            onChangeRef.current(update.state.doc.toString());
          }),
          edgeRulesExtensions({
            service: () => serviceRef.current,
            variant: 'editor',
            lintDelay: 0,
          }),
        ],
      }),
    });

    viewRef.current = view;
    forceLinting(view);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The initial doc is intentionally not a dependency; prop updates flow through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
