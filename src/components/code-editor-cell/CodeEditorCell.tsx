import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { EditorState, type Extension } from '@codemirror/state';
import { forceLinting } from '@codemirror/lint';
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { edgeRulesExtensions } from '../code-editor/language/extensions';
import {
  embedService,
  type CodeEditorEmbedContext,
  type CodeEditorService,
} from '../code-editor/language/service';

export type {
  CodeEditorEmbedContext,
  CodeEditorService,
} from '../code-editor/language/service';

export interface CodeEditorCellProps {
  value: string;
  onChange?: (value: string) => void;
  /** Called with the current text on Enter (single-line), Mod-Enter (multiline), or blur. */
  onCommit?: (value: string) => void;
  /** Called on Escape. The host decides whether to revert the value. */
  onCancel?: () => void;
  /** Same contract as `CodeEditor` — pass the dev `MutableDecisionService` directly. */
  service: CodeEditorService;
  /**
   * Model text around the cell. Diagnostics and completions run against
   * `prefix + value + suffix`, so the cell is analyzed in the scope of its surrounding model
   * (fields, functions, and types defined outside the cell complete and lint correctly).
   */
  embedContext?: CodeEditorEmbedContext;
  /** When true, Enter inserts a newline and Mod-Enter commits. Default: single-line. */
  multiline?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
}

/** Flattens any multi-line document into a single line (paste included). */
function singleLineFilter(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || tr.newDoc.lines <= 1) {
      return tr;
    }
    const flat = tr.newDoc.toString().replace(/\r?\n\s*/g, ' ');
    return [
      {
        changes: { from: 0, to: tr.startState.doc.length, insert: flat },
        selection: {
          anchor: Math.min(tr.newSelection.main.anchor, flat.length),
        },
      },
    ];
  });
}

/**
 * A compact EdgeRules expression editor for table/boxed-expression cells.
 *
 * Same language capabilities as `CodeEditor` — syntax highlighting, engine diagnostics,
 * Ctrl+Space completions, Ctrl+Click / F12 go-to-definition, Shift-Alt-F formatting — in a
 * one-line-tall control with spreadsheet-style editing semantics: Enter commits, Escape
 * cancels, blur commits, Tab is left for the host grid's focus navigation.
 */
export function CodeEditorCell({
  value,
  onChange,
  onCommit,
  onCancel,
  service,
  embedContext,
  multiline = false,
  autoFocus = false,
  placeholder,
  readOnly = false,
  className,
  sx,
}: CodeEditorCellProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const serviceRef = useRef<CodeEditorService>(service);
  const callbacksRef = useRef({ onChange, onCommit, onCancel });
  const syncingFromPropRef = useRef(false);
  const suppressBlurCommitRef = useRef(false);

  const effectiveService = useMemo(
    () => (embedContext ? embedService(service, embedContext) : service),
    [service, embedContext],
  );

  useEffect(() => {
    serviceRef.current = effectiveService;
    if (viewRef.current) {
      forceLinting(viewRef.current);
    }
  }, [effectiveService]);

  useEffect(() => {
    callbacksRef.current = { onChange, onCommit, onCancel };
  }, [onChange, onCommit, onCancel]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const commit = (view: EditorView): boolean => {
      suppressBlurCommitRef.current = true;
      callbacksRef.current.onCommit?.(view.state.doc.toString());
      return true;
    };

    const cellKeymap = keymap.of([
      ...(multiline
        ? [{ key: 'Mod-Enter', run: commit }]
        : [{ key: 'Enter', run: commit }]),
      {
        key: 'Escape',
        run: () => {
          suppressBlurCommitRef.current = true;
          callbacksRef.current.onCancel?.();
          return true;
        },
      },
    ]);

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          // Cell keymap first so Enter/Escape win over the default editing keymap; the
          // autocomplete panel's own bindings still take precedence (registered highest).
          cellKeymap,
          ...(multiline ? [EditorView.lineWrapping] : [singleLineFilter()]),
          ...(placeholder ? [cmPlaceholder(placeholder)] : []),
          EditorView.editable.of(!readOnly),
          EditorState.readOnly.of(readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !syncingFromPropRef.current) {
              suppressBlurCommitRef.current = false;
              callbacksRef.current.onChange?.(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            blur(event, blurredView) {
              const next = event.relatedTarget;
              if (next instanceof Node && blurredView.dom.contains(next)) {
                return false;
              }
              if (suppressBlurCommitRef.current) {
                return false;
              }
              callbacksRef.current.onCommit?.(blurredView.state.doc.toString());
              return false;
            },
          }),
          edgeRulesExtensions({
            service: () => serviceRef.current,
            variant: 'cell',
            lintDelay: 0,
          }),
        ],
      }),
    });

    viewRef.current = view;
    forceLinting(view);
    if (autoFocus) {
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The initial doc is intentionally not a dependency; prop updates flow through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, multiline, placeholder, autoFocus]);

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
        borderRadius: 0.5,
        overflow: 'hidden',
        width: '100%',
        '&:focus-within': {
          borderColor: (theme) => theme.palette.primary.main,
        },
        '& .cm-editor': {
          fontFamily: 'monospace',
          fontSize: '0.85rem',
        },
        '& .cm-editor.cm-focused': {
          outline: 'none',
        },
        '& .cm-content': {
          padding: '2px 0',
        },
        '& .cm-line': {
          padding: '0 6px',
        },
        ...sx,
      }}
    >
      <div ref={hostRef} />
    </Box>
  );
}
