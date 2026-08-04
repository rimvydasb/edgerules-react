import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import {
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { edgeRulesCompletion } from './completion';
import { edgeRulesFormatKeymap } from './format';
import { edgeRules } from './language';
import { edgeRulesLint } from './lint';
import { edgeRulesGoToDefinition } from './navigation';
import type { CodeEditorService } from './service';

export interface EdgeRulesExtensionOptions {
  /** Read on every lint/completion pass, so a changed service needs no reconfiguration. */
  service: () => CodeEditorService;
  /** `editor` is the full-document editor chrome; `cell` is the compact in-cell variant. */
  variant?: 'editor' | 'cell';
  lintDelay?: number;
}

/**
 * The complete EdgeRules editing experience: DSL syntax highlighting, engine diagnostics,
 * engine completions (Ctrl+Space), Ctrl+Click / F12 go-to-definition, Shift-Alt-F formatting,
 * plus the standard editing niceties (history, bracket matching, auto-close, auto-indent).
 */
export function edgeRulesExtensions(options: EdgeRulesExtensionOptions): Extension[] {
  const { service, variant = 'editor', lintDelay } = options;
  const isEditor = variant === 'editor';

  return [
    ...(isEditor ? [lineNumbers(), highlightActiveLineGutter(), highlightActiveLine()] : []),
    history(),
    drawSelection(),
    indentUnit.of('  '),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    edgeRules(),
    edgeRulesLint(service, { delay: lintDelay }),
    edgeRulesCompletion(service),
    edgeRulesGoToDefinition(),
    edgeRulesFormatKeymap(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...lintKeymap,
      ...(isEditor ? [indentWithTab] : []),
    ]),
  ];
}
