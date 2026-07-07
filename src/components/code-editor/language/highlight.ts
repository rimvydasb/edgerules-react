import { highlightCode } from '@lezer/highlight';
import { edgeRulesHighlighter, edgeRulesLanguage } from './language';

export interface HighlightedSpan {
  text: string;
  /** Space-separated `tok-*` classes; empty for plain text (whitespace, unstyled tokens). */
  className: string;
}

/**
 * Headless syntax highlighting for EdgeRules DSL snippets: parses `code` with the shared
 * language and returns styled spans using the same stable `tok-*` classes the editors emit.
 * No CodeMirror view is involved, so this is cheap enough to run for every display-only
 * table cell.
 */
export function highlightEdgeRules(code: string): HighlightedSpan[] {
  const spans: HighlightedSpan[] = [];
  highlightCode(
    code,
    edgeRulesLanguage.parser.parse(code),
    edgeRulesHighlighter,
    (text, className) => spans.push({ text, className }),
    () => spans.push({ text: '\n', className: '' }),
  );
  return spans;
}
