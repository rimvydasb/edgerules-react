import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

/**
 * Conservative EdgeRules DSL formatter.
 *
 * Purely lexical (strings and comments are preserved byte-for-byte), so it is safe on broken
 * code mid-edit. It normalizes:
 * - indentation from bracket depth (`{`, `[`, `(`), two spaces per level by default;
 * - a single space after `:` and `,`, none before them;
 * - runs of spaces between tokens down to one;
 * - trailing whitespace and 3+ consecutive blank lines down to one.
 */

const DEFAULT_INDENT = '  ';

interface LineToken {
  text: string;
  kind: 'code' | 'string' | 'comment';
}

/** Splits a line into code/string/comment segments so only code segments get rewritten. */
function segmentLine(line: string): LineToken[] {
  const tokens: LineToken[] = [];
  let current = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '/' && line[i + 1] === '/') {
      if (current) {
        tokens.push({ text: current, kind: 'code' });
        current = '';
      }
      tokens.push({ text: line.slice(i), kind: 'comment' });
      return tokens;
    }
    if (ch === '"' || ch === "'") {
      if (current) {
        tokens.push({ text: current, kind: 'code' });
        current = '';
      }
      let j = i + 1;
      while (j < line.length && line[j] !== ch) {
        j += 1;
      }
      j = Math.min(j + 1, line.length);
      tokens.push({ text: line.slice(i, j), kind: 'string' });
      i = j;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current) {
    tokens.push({ text: current, kind: 'code' });
  }
  return tokens;
}

function normalizeCode(code: string): string {
  return (
    code
      // collapse runs of spaces/tabs between tokens
      .replace(/[ \t]+/g, ' ')
      // no space before `,`/`;`/`:` — but leave `::` (nonexistent) and range `..` alone
      .replace(/ +([,;:])/g, '$1')
      // exactly one space after `:` and `,` unless end of segment
      .replace(/([,:])(?=[^ \n])/g, '$1 ')
      // `: ` before a newline-ish end is trimmed later by trailing-whitespace pass
      .replace(/([,:]) +/g, '$1 ')
  );
}

function bracketDelta(code: string): { net: number; leadingClosers: number } {
  let net = 0;
  let leadingClosers = 0;
  let seenOpener = false;
  for (const ch of code) {
    if (ch === '{' || ch === '[' || ch === '(') {
      net += 1;
      seenOpener = true;
    } else if (ch === '}' || ch === ']' || ch === ')') {
      net -= 1;
      if (!seenOpener && net < -leadingClosers + 0) {
        leadingClosers += 1;
      }
    } else if (!/\s/.test(ch)) {
      seenOpener = true; // any other token stops the "leading closers" run
    }
  }
  return { net, leadingClosers };
}

/** Formats EdgeRules source. Idempotent; safe on syntactically broken input. */
export function formatEdgeRules(source: string, indentUnit: string = DEFAULT_INDENT): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let depth = 0;
  let blankRun = 0;

  for (const rawLine of lines) {
    const segments = segmentLine(rawLine.trim());
    const body = segments
      .map((segment) => (segment.kind === 'code' ? normalizeCode(segment.text) : segment.text))
      .join('')
      .trimEnd();

    if (body === '') {
      blankRun += 1;
      if (blankRun <= 1 && out.length > 0) {
        out.push('');
      }
      continue;
    }
    blankRun = 0;

    const codeOnly = segments
      .filter((segment) => segment.kind === 'code')
      .map((segment) => segment.text)
      .join(' ');
    const { net, leadingClosers } = bracketDelta(codeOnly);

    const indentLevel = Math.max(0, depth - leadingClosers);
    out.push(indentUnit.repeat(indentLevel) + body);
    depth = Math.max(0, depth + net);
  }

  // Drop trailing blank lines, keep exactly one trailing newline if the source had content.
  while (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
  }
  return out.join('\n') + (out.length > 0 && source.endsWith('\n') ? '\n' : '');
}

/** Replaces the document with its formatted form, keeping the cursor near its position. */
export function formatDocument(view: EditorView): boolean {
  const source = view.state.doc.toString();
  const formatted = formatEdgeRules(source);
  if (formatted === source) {
    return true;
  }
  const head = view.state.selection.main.head;
  view.dispatch({
    changes: { from: 0, to: source.length, insert: formatted },
    selection: { anchor: Math.min(head, formatted.length) },
    userEvent: 'format',
  });
  return true;
}

/** Shift-Alt-F (the de-facto IDE standard) formats the document. */
export function edgeRulesFormatKeymap(): Extension {
  return keymap.of([{ key: 'Shift-Alt-f', run: formatDocument }]);
}
