import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

/**
 * Lexical go-to-definition for EdgeRules DSL.
 *
 * The document is scanned into a scope tree (every `{...}` block is a scope; `name:`, `func`,
 * `ruleset`, `type` introduce definitions; callable parameters are definitions of the body
 * scope). A symbol resolves through the innermost enclosing scope's parent chain, and dotted
 * receivers (`applicant.address.city`) descend through the definitions' body scopes — the same
 * lexical strategy the engine's completion uses for member access.
 */

export interface DefinitionTarget {
  from: number;
  to: number;
}

interface Def {
  name: string;
  from: number;
  to: number;
  body: Scope | null;
}

interface Scope {
  from: number;
  to: number;
  parent: Scope | null;
  defs: Map<string, Def>;
  children: Scope[];
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;

function isDefinitionContainer(bracketStack: string[]): boolean {
  return bracketStack.length === 0 || bracketStack[bracketStack.length - 1] === '{';
}

/** Builds the scope tree. Purely lexical: strings and comments are skipped, never parsed. */
function scan(code: string): Scope {
  const root: Scope = { from: 0, to: code.length, parent: null, defs: new Map(), children: [] };
  let scope = root;
  const bracketStack: string[] = [];

  // Definition whose value may start at the next significant token; if that token is `{`, the
  // opened scope becomes the definition's body (with any pending callable parameters injected).
  let pendingDef: Def | null = null;
  let pendingParams: Def[] = [];

  let i = 0;
  const n = code.length;

  const skipTrivia = (): void => {
    for (;;) {
      while (i < n && /\s/.test(code[i])) {
        i += 1;
      }
      if (code[i] === '/' && code[i + 1] === '/') {
        while (i < n && code[i] !== '\n') {
          i += 1;
        }
        continue;
      }
      return;
    }
  };

  const readIdent = (): { name: string; from: number; to: number } | null => {
    skipTrivia();
    if (i >= n || !IDENT_START.test(code[i])) {
      return null;
    }
    const from = i;
    while (i < n && IDENT_CHAR.test(code[i])) {
      i += 1;
    }
    return { name: code.slice(from, i), from, to: i };
  };

  const peekChar = (): string => {
    const j = i;
    skipTrivia();
    const ch = code[i] ?? '';
    i = j;
    return ch;
  };

  const readParams = (): Def[] => {
    // At the opening paren of a callable signature; collect the first identifier of every
    // comma-separated group at depth 1 (annotations after `:` are skipped by the group rule).
    const params: Def[] = [];
    skipTrivia();
    if (code[i] !== '(') {
      return params;
    }
    i += 1;
    let depth = 1;
    let expectParam = true;
    while (i < n && depth > 0) {
      const ch = code[i];
      if (ch === '/' && code[i + 1] === '/') {
        while (i < n && code[i] !== '\n') {
          i += 1;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        i += 1;
        while (i < n && code[i] !== ch && code[i] !== '\n') {
          i += 1;
        }
        i += 1;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === ')' || ch === ']' || ch === '}') {
        depth -= 1;
        i += 1;
        continue;
      }
      if (depth === 1 && ch === ',') {
        expectParam = true;
        i += 1;
        continue;
      }
      if (depth === 1 && expectParam && IDENT_START.test(ch)) {
        const from = i;
        while (i < n && IDENT_CHAR.test(code[i])) {
          i += 1;
        }
        params.push({ name: code.slice(from, i), from, to: i, body: null });
        expectParam = false;
        continue;
      }
      i += 1;
    }
    return params;
  };

  while (i < n) {
    skipTrivia();
    if (i >= n) {
      break;
    }
    const ch = code[i];

    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < n && code[i] !== ch && code[i] !== '\n') {
        i += 1;
      }
      i += 1;
      pendingDef = null;
      continue;
    }

    if (ch === '{') {
      const child: Scope = { from: i, to: n, parent: scope, defs: new Map(), children: [] };
      scope.children.push(child);
      if (pendingDef) {
        pendingDef.body = child;
        for (const param of pendingParams) {
          child.defs.set(param.name, param);
        }
      }
      pendingDef = null;
      pendingParams = [];
      scope = child;
      bracketStack.push('{');
      i += 1;
      continue;
    }
    if (ch === '}') {
      if (bracketStack[bracketStack.length - 1] === '{') {
        bracketStack.pop();
        scope.to = i + 1;
        scope = scope.parent ?? root;
      }
      i += 1;
      pendingDef = null;
      continue;
    }
    if (ch === '[' || ch === '(') {
      bracketStack.push(ch);
      i += 1;
      pendingDef = null;
      continue;
    }
    if (ch === ']' || ch === ')') {
      const top = bracketStack[bracketStack.length - 1];
      if ((ch === ']' && top === '[') || (ch === ')' && top === '(')) {
        bracketStack.pop();
      }
      i += 1;
      pendingDef = null;
      continue;
    }

    if (IDENT_START.test(ch)) {
      const start = i;
      while (i < n && IDENT_CHAR.test(code[i])) {
        i += 1;
      }
      const name = code.slice(start, i);

      if ((name === 'func' || name === 'ruleset') && isDefinitionContainer(bracketStack)) {
        const defName = readIdent();
        if (defName) {
          const def: Def = { ...defName, body: null };
          scope.defs.set(def.name, def);
          const params = readParams();
          skipTrivia();
          if (code[i] === ':') {
            i += 1;
            pendingDef = def;
            pendingParams = params;
          }
        }
        continue;
      }

      if (name === 'type' && isDefinitionContainer(bracketStack) && peekChar() !== ':') {
        const defName = readIdent();
        if (defName) {
          const def: Def = { ...defName, body: null };
          scope.defs.set(def.name, def);
          skipTrivia();
          if (code[i] === ':') {
            i += 1;
            pendingDef = def;
            pendingParams = [];
          }
        }
        continue;
      }

      if (isDefinitionContainer(bracketStack) && peekChar() === ':') {
        const def: Def = { name, from: start, to: i, body: null };
        scope.defs.set(name, def);
        skipTrivia();
        i += 1; // consume ':'
        pendingDef = def;
        pendingParams = [];
        continue;
      }

      pendingDef = null;
      continue;
    }

    // Any other significant token (number, operator, separator) breaks a pending `def: {` link,
    // except the separators that merely follow the colon we already consumed.
    if (!/\s/.test(ch)) {
      pendingDef = null;
    }
    i += 1;
  }

  return root;
}

function wordAt(code: string, pos: number): { name: string; from: number; to: number } | null {
  if (pos < 0 || pos > code.length) {
    return null;
  }
  let from = pos;
  while (from > 0 && IDENT_CHAR.test(code[from - 1])) {
    from -= 1;
  }
  let to = pos;
  while (to < code.length && IDENT_CHAR.test(code[to])) {
    to += 1;
  }
  if (from === to || !IDENT_START.test(code[from])) {
    return null;
  }
  return { name: code.slice(from, to), from, to };
}

/** Dotted receiver segments before `wordFrom` (`applicant.address.|city|` → both receivers). */
function receiverPath(code: string, wordFrom: number): string[] {
  const path: string[] = [];
  let i = wordFrom;
  for (;;) {
    let j = i - 1;
    while (j >= 0 && /[ \t]/.test(code[j])) {
      j -= 1;
    }
    if (j < 0 || code[j] !== '.') {
      break;
    }
    // `..` (range) or `...` (context variable) is not member access.
    if (code[j - 1] === '.') {
      break;
    }
    j -= 1;
    while (j >= 0 && /[ \t]/.test(code[j])) {
      j -= 1;
    }
    const end = j + 1;
    while (j >= 0 && IDENT_CHAR.test(code[j])) {
      j -= 1;
    }
    const start = j + 1;
    if (start === end || !IDENT_START.test(code[start])) {
      break;
    }
    path.unshift(code.slice(start, end));
    i = start;
  }
  return path;
}

function innermostScope(scope: Scope, pos: number): Scope {
  for (const child of scope.children) {
    if (pos > child.from && pos <= child.to) {
      return innermostScope(child, pos);
    }
  }
  return scope;
}

/**
 * Resolves the symbol at `pos` to its definition's name range, or `null` when it cannot be
 * resolved lexically.
 */
export function findDefinition(code: string, pos: number): DefinitionTarget | null {
  const word = wordAt(code, pos);
  if (!word) {
    return null;
  }

  const segments = [...receiverPath(code, word.from), word.name];
  const scopes = scan(code);
  let scope: Scope | null = innermostScope(scopes, pos);

  let def: Def | null = null;
  while (scope) {
    const found = scope.defs.get(segments[0]);
    if (found && !(word.from === found.from && segments.length === 1)) {
      def = found;
      break;
    }
    scope = scope.parent;
  }

  for (let s = 1; def && s < segments.length; s += 1) {
    def = def.body?.defs.get(segments[s]) ?? null;
  }

  return def ? { from: def.from, to: def.to } : null;
}

function jumpToDefinition(view: EditorView, pos: number): boolean {
  const target = findDefinition(view.state.doc.toString(), pos);
  if (!target) {
    return false;
  }
  view.dispatch({
    selection: { anchor: target.from, head: target.to },
    scrollIntoView: true,
    userEvent: 'select.definition',
  });
  return true;
}

const MODIFIER_CLASS = 'cm-edgerules-nav';

const navigationTheme = EditorView.baseTheme({
  [`&.${MODIFIER_CLASS} .cm-line`]: { cursor: 'pointer' },
});

/**
 * Ctrl+Click (Cmd+Click on macOS) and F12 go-to-definition. While the modifier is held the
 * pointer becomes a hand as a navigation affordance.
 */
export function edgeRulesGoToDefinition(): Extension {
  return [
    navigationTheme,
    keymap.of([
      {
        key: 'F12',
        run: (view) => jumpToDefinition(view, view.state.selection.main.head),
      },
    ]),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!(event.ctrlKey || event.metaKey) || event.button !== 0) {
          return false;
        }
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) {
          return false;
        }
        if (jumpToDefinition(view, pos)) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      keydown(event, view) {
        if (event.key === 'Control' || event.key === 'Meta') {
          view.dom.classList.add(MODIFIER_CLASS);
        }
        return false;
      },
      keyup(event, view) {
        if (event.key === 'Control' || event.key === 'Meta') {
          view.dom.classList.remove(MODIFIER_CLASS);
        }
        return false;
      },
      blur(_event, view) {
        view.dom.classList.remove(MODIFIER_CLASS);
        return false;
      },
    }),
  ];
}
