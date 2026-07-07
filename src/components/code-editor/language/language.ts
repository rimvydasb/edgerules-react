import {
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
  type StreamParser,
} from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tagHighlighter, tags as t } from '@lezer/highlight';

/**
 * EdgeRules DSL tokenizer for CodeMirror, derived from the language EBNF
 * (edgerules-v2 `doc/architecture/EBNF.md`): line comments, single/double quoted strings
 * without escapes, int/float numbers, `..` ranges, the `...`/`it` context variable, and the
 * reserved-word categories (control flow, definitions, logical, booleans, special values,
 * primitive types).
 */

const CONTROL_KEYWORDS = new Set(['if', 'then', 'else', 'for', 'in', 'return']);
const DEFINITION_KEYWORDS = new Set(['func', 'type', 'ruleset', 'as']);
const LOGIC_KEYWORDS = new Set(['not', 'and', 'or', 'xor']);
const BOOLEAN_LITERALS = new Set(['true', 'false']);
const SPECIAL_VALUES = new Set(['Missing', 'NotApplicable', 'Invalid']);
const PRIMITIVE_TYPES = new Set([
  'number',
  'string',
  'boolean',
  'date',
  'time',
  'datetime',
  'duration',
  'period',
]);

interface EdgeRulesStreamState {
  /** Open `{`/`[`/`(` count, drives auto-indentation. */
  depth: number;
  /** True right after a `.` token, so the next identifier is a member access. */
  afterDot: boolean;
}

const streamParser: StreamParser<EdgeRulesStreamState> = {
  name: 'edgerules',

  startState: () => ({ depth: 0, afterDot: false }),

  token(stream, state) {
    if (stream.eatSpace()) {
      return null;
    }

    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    const quote = stream.peek();
    if (quote === '"' || quote === "'") {
      stream.next();
      // No escape sequences in the DSL; an unclosed string runs to the end of the line.
      while (!stream.eol() && stream.next() !== quote) {
        // consume
      }
      state.afterDot = false;
      return 'string';
    }

    if (stream.match(/^\d+(\.\d+)?/)) {
      state.afterDot = false;
      return 'number';
    }

    if (stream.match('...')) {
      state.afterDot = false;
      return 'self';
    }
    if (stream.match('..')) {
      state.afterDot = false;
      return 'operator';
    }
    if (stream.eat('.')) {
      state.afterDot = true;
      return 'punctuation';
    }

    const word = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (word) {
      const name = (word as RegExpMatchArray)[0];
      const wasAfterDot = state.afterDot;
      state.afterDot = false;
      const followedByColon = Boolean(stream.match(/^\s*:/, false));
      const followedByParen = Boolean(stream.match(/^\s*\(/, false));

      if (wasAfterDot) {
        return followedByParen ? 'function' : 'propertyName';
      }
      if (SPECIAL_VALUES.has(name)) {
        return 'atom';
      }
      if (PRIMITIVE_TYPES.has(name)) {
        return 'primitiveType';
      }
      if (name === 'it') {
        return 'self';
      }
      // Keywords may still be field names (`return: a + b`) — definition position wins.
      if (followedByColon) {
        return 'propertyDefinition';
      }
      if (name === 'any') {
        return 'keyword';
      }
      if (BOOLEAN_LITERALS.has(name)) {
        return 'bool';
      }
      if (CONTROL_KEYWORDS.has(name)) {
        return 'controlKeyword';
      }
      if (DEFINITION_KEYWORDS.has(name)) {
        return 'definitionKeyword';
      }
      if (LOGIC_KEYWORDS.has(name)) {
        return 'operatorKeyword';
      }
      if (followedByParen) {
        return 'function';
      }
      if (/^[A-Z]/.test(name)) {
        return 'typeName';
      }
      return 'variableName';
    }

    state.afterDot = false;

    if (stream.match(/^(<=|>=|<>)/)) {
      return 'compareOperator';
    }

    const ch = stream.next();
    switch (ch) {
      case '{':
      case '[':
      case '(':
        state.depth += 1;
        return 'bracket';
      case '}':
      case ']':
      case ')':
        state.depth = Math.max(0, state.depth - 1);
        return 'bracket';
      case ',':
      case ';':
      case ':':
        return 'punctuation';
      case '=':
      case '<':
      case '>':
        return 'compareOperator';
      case '+':
      case '-':
      case '*':
      case '/':
      case '%':
      case '^':
      case '×':
      case '÷':
        return 'operator';
      default:
        return null;
    }
  },

  indent(state, textAfter, context) {
    const closing = /^[}\])]/.test(textAfter.trim());
    return Math.max(0, state.depth - (closing ? 1 : 0)) * context.unit;
  },

  languageData: {
    commentTokens: { line: '//' },
    closeBrackets: { brackets: ['(', '[', '{', "'", '"'] },
    indentOnInput: /^\s*[}\])]$/,
  },

  tokenTable: {
    comment: t.lineComment,
    string: t.string,
    number: t.number,
    bool: t.bool,
    atom: t.atom,
    self: t.self,
    keyword: t.keyword,
    controlKeyword: t.controlKeyword,
    definitionKeyword: t.definitionKeyword,
    operatorKeyword: t.operatorKeyword,
    primitiveType: t.standard(t.typeName),
    typeName: t.typeName,
    propertyName: t.propertyName,
    propertyDefinition: t.definition(t.propertyName),
    variableName: t.variableName,
    function: t.function(t.variableName),
    operator: t.operator,
    compareOperator: t.compareOperator,
    punctuation: t.punctuation,
    bracket: t.bracket,
  },
};

export const edgeRulesLanguage = StreamLanguage.define(streamParser);

/**
 * Emits stable `tok-*` CSS classes (instead of theme-generated ones) so hosts can restyle
 * highlighting with plain CSS and tests can assert on class names.
 */
const edgeRulesHighlighter = tagHighlighter([
  { tag: t.comment, class: 'tok-comment' },
  { tag: t.string, class: 'tok-string' },
  { tag: t.number, class: 'tok-number' },
  { tag: t.bool, class: 'tok-bool' },
  { tag: t.atom, class: 'tok-atom' },
  { tag: t.self, class: 'tok-self' },
  { tag: t.keyword, class: 'tok-keyword' },
  { tag: t.typeName, class: 'tok-typeName' },
  { tag: t.definition(t.propertyName), class: 'tok-propertyName tok-definition' },
  { tag: t.propertyName, class: 'tok-propertyName' },
  { tag: t.function(t.variableName), class: 'tok-function' },
  { tag: t.variableName, class: 'tok-variableName' },
  { tag: t.operator, class: 'tok-operator' },
  { tag: t.punctuation, class: 'tok-punctuation' },
]);

const highlightTheme = EditorView.baseTheme({
  '&light .tok-keyword': { color: '#7b1fa2' },
  '&light .tok-atom': { color: '#e65100' },
  '&light .tok-bool': { color: '#0b7285' },
  '&light .tok-number': { color: '#098658' },
  '&light .tok-string': { color: '#a31515' },
  '&light .tok-comment': { color: '#6a737d', fontStyle: 'italic' },
  '&light .tok-typeName': { color: '#267f99' },
  '&light .tok-propertyName': { color: '#001080' },
  '&light .tok-variableName': { color: '#0070c1' },
  '&light .tok-function': { color: '#795e26' },
  '&light .tok-self': { color: '#0000ff', fontStyle: 'italic' },
  '&dark .tok-keyword': { color: '#c792ea' },
  '&dark .tok-atom': { color: '#d19a66' },
  '&dark .tok-bool': { color: '#56b6c2' },
  '&dark .tok-number': { color: '#b5cea8' },
  '&dark .tok-string': { color: '#ce9178' },
  '&dark .tok-comment': { color: '#7f848e', fontStyle: 'italic' },
  '&dark .tok-typeName': { color: '#4ec9b0' },
  '&dark .tok-propertyName': { color: '#9cdcfe' },
  '&dark .tok-variableName': { color: '#9cdcfe' },
  '&dark .tok-function': { color: '#dcdcaa' },
  '&dark .tok-self': { color: '#569cd6', fontStyle: 'italic' },
});

/** Language, highlighting, and default styling for EdgeRules DSL documents. */
export function edgeRules(): LanguageSupport {
  return new LanguageSupport(edgeRulesLanguage, [
    syntaxHighlighting(edgeRulesHighlighter),
    highlightTheme,
  ]);
}
