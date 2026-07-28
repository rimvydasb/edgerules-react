import type {
  PortableContext,
  PortableNode,
  PortableRule,
  PortableRulesetDefinition,
  PortableRulesetSchema,
  PortableTypeDefinition,
  PortableTypeReference,
  PortableTypedValue,
} from '@edgerules/portable';
import type { CodeEditorEmbedContext } from '../code-editor/language/service';

export type HitPolicy = PortableRulesetDefinition['@hitPolicy'];

export const HIT_POLICIES: Array<{ value: HitPolicy; badge: string; label: string }> = [
  { value: 'first-match', badge: 'F', label: 'First match' },
  { value: 'unique-match', badge: 'U', label: 'Unique match' },
  { value: 'collect-matches', badge: 'C', label: 'Collect matches' },
  { value: 'best-match', badge: 'P', label: 'Best match (priority)' },
];

/** The column key used for the single output of a scorecard (scalar `then`) ruleset. */
export const SCALAR_OUTPUT = '';

export interface DecisionTableColumn {
  kind: 'input' | 'output';
  /** Parameter name (input) / `then` field name (output); `SCALAR_OUTPUT` for scorecards. */
  name: string;
  typeLabel: string;
}

export interface DecisionTableRow {
  when:
    | { kind: 'cells'; cells: Record<string, string> }
    | { kind: 'expression'; text: string };
  /** DSL text per output column name; scorecards use the single `SCALAR_OUTPUT` key. */
  then: Record<string, string>;
  name?: string;
  priority?: number;
}

export interface DecisionTableModel {
  hitPolicy: HitPolicy;
  inputs: DecisionTableColumn[];
  outputs: DecisionTableColumn[];
  rows: DecisionTableRow[];
  /** Output texts of the default row, when the ruleset declares one. */
  defaultRow?: Record<string, string>;
  /** True when every rule's `then` is a scalar (score) rather than a record. */
  scorecard: boolean;
}

function isRecord(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

function isExpressionNode(node: unknown): node is { expression: unknown } {
  return isRecord(node) && node['@kind'] === 'expression';
}

function isContextNode(node: unknown): node is PortableContext {
  return isRecord(node) && (node['@kind'] === 'context' || node['@kind'] === undefined);
}

export function typeLabelOf(
  type: PortableTypeReference | PortableTypedValue | PortableTypeDefinition | null | undefined,
): string {
  if (type === null || type === undefined) {
    return '';
  }
  if (typeof type === 'string') {
    return type;
  }
  if (type['@kind'] === 'type-definition') {
    return 'object';
  }
  const typed = type as PortableTypedValue;
  if (typed.type === 'array') {
    const items = typed.items;
    return `${typeof items === 'string' ? items : (items?.type ?? '')}[]`;
  }
  return typed.type ?? '';
}

const RANGE_TEST = /^\.\.\.\s*>=\s*(.+?)\s+and\s+\.\.\.\s*<=\s*(.+)$/;
const EQUALITY_TEST = /^\.\.\.\s*=\s*(.+)$/;

/**
 * Re-sugars a unary-test cell for display/editing back to `a..b` / bare-value form, tolerating
 * either the compact form the engine now echoes (`"18..25"`) or the fully-normalized form
 * (`"... >= 18 and ... <= 25"`) some rule nodes may still carry. `any` becomes the empty string
 * — the grid shows it as "–".
 */
export function prettyUnaryTest(raw: string): string {
  const text = raw.trim();
  if (text === 'any') {
    return '';
  }
  const range = RANGE_TEST.exec(text);
  if (range && !range[1].includes('...') && !range[2].includes('...')) {
    return `${range[1]}..${range[2]}`;
  }
  const equality = EQUALITY_TEST.exec(text);
  if (equality && !equality[1].includes('...')) {
    return equality[1];
  }
  // `... >= 18 and ... <= 64 or ... = 99` → `>= 18 and <= 64 or = 99` (valid unary-test DSL).
  return text.replace(/\.\.\.\s*/g, '');
}

/** Serializes a Portable `then`/`default` cell value back to editable DSL text. */
export function formatCellValue(node: PortableNode | undefined): string {
  if (node === undefined) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'number' || typeof node === 'boolean') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return `[${node.map((item) => formatCellValue(item as PortableNode)).join(', ')}]`;
  }
  if (isExpressionNode(node)) {
    return formatCellValue(node.expression as PortableNode);
  }
  if (isRecord(node)) {
    const entries = Object.entries(node)
      .filter(([key]) => !key.startsWith('@'))
      .map(([key, value]) => `${key}: ${formatCellValue(value as PortableNode)}`);
    return `{ ${entries.join(', ')} }`;
  }
  return String(node);
}

export function parameterNames(definition: PortableRulesetDefinition): string[] {
  return Object.keys(definition['@parameters']);
}

function ruleThenIsScalar(rule: PortableRule): boolean {
  return !isContextNode(rule.then);
}

export function buildTableModel(
  definition: PortableRulesetDefinition,
  schema?: PortableRulesetSchema,
): DecisionTableModel {
  const params = definition['@parameters'];
  const inputs: DecisionTableColumn[] = Object.entries(params).map(([name, type]) => ({
    kind: 'input',
    name,
    typeLabel: typeLabelOf(type),
  }));

  const rules = definition['@rules'];
  const scorecard = rules.length > 0 && rules.every(ruleThenIsScalar);

  const returnType = schema?.['@return'];
  const returnFields =
    isRecord(returnType) && returnType['@kind'] === 'type-definition'
      ? (returnType as unknown as PortableTypeDefinition)
      : undefined;

  let outputs: DecisionTableColumn[];
  if (scorecard) {
    // The schema's @return is the call result (an array under collect-matches); each cell
    // holds a single score, so strip the list suffix for the column label.
    const label = returnFields ? '' : typeLabelOf(returnType as PortableTypeReference);
    outputs = [
      {
        kind: 'output',
        name: SCALAR_OUTPUT,
        typeLabel: label.endsWith('[]') ? label.slice(0, -2) : label,
      },
    ];
  } else {
    // Authored column order comes from the first rule's `then` (the schema's @return sorts
    // fields alphabetically); the schema supplies the inferred types.
    const firstThen = rules.find((rule) => isContextNode(rule.then))?.then ?? definition['@default'];
    const names = firstThen
      ? Object.keys(firstThen).filter((key) => !key.startsWith('@'))
      : Object.keys(returnFields ?? {}).filter((key) => !key.startsWith('@'));
    outputs = names.map((name) => ({
      kind: 'output',
      name,
      typeLabel: typeLabelOf(
        returnFields?.[name] as PortableTypedValue | PortableTypeDefinition | undefined,
      ),
    }));
  }

  const paramNames = inputs.map((column) => column.name);
  const rows = rules.map((rule) => ruleToRow(rule, paramNames, scorecard));

  const defaultNode = definition['@default'];
  const defaultRow = defaultNode
    ? scorecard || !isContextNode(defaultNode)
      ? { [SCALAR_OUTPUT]: formatCellValue(defaultNode) }
      : Object.fromEntries(
          outputs.map((column) => [column.name, formatCellValue(defaultNode[column.name] as PortableNode)]),
        )
    : undefined;

  return {
    hitPolicy: definition['@hitPolicy'],
    inputs,
    outputs,
    rows,
    defaultRow,
    scorecard,
  };
}

export function ruleToRow(
  rule: PortableRule,
  paramNames: string[],
  scorecard: boolean,
): DecisionTableRow {
  let when: DecisionTableRow['when'];
  if (isExpressionNode(rule.when)) {
    when = { kind: 'expression', text: formatCellValue(rule.when.expression as PortableNode) };
  } else {
    const cells: Record<string, string> = {};
    for (const name of paramNames) {
      const raw = rule.when?.[name];
      cells[name] = raw === undefined ? '' : prettyUnaryTest(raw);
    }
    when = { kind: 'cells', cells };
  }

  const then: Record<string, string> = {};
  if (scorecard || !isContextNode(rule.then)) {
    then[SCALAR_OUTPUT] = formatCellValue(rule.then as PortableNode);
  } else {
    for (const [key, value] of Object.entries(rule.then)) {
      if (!key.startsWith('@')) {
        then[key] = formatCellValue(value as PortableNode);
      }
    }
  }

  return { when, then, name: rule.name, priority: rule.priority };
}

/** Builds the Portable rule node a row edits back into; texts are DSL as the user typed them. */
export function rowToRule(row: DecisionTableRow, scorecard: boolean): PortableRule {
  const rule: PortableRule = { '@kind': 'rule', then: {} };

  if (row.when.kind === 'expression') {
    const text = row.when.text.trim();
    if (text.length > 0) {
      rule.when = { '@kind': 'expression', expression: text } as unknown as PortableRule['when'];
    }
  } else {
    const cells: Record<string, string> = {};
    for (const [name, text] of Object.entries(row.when.cells)) {
      const trimmed = text.trim();
      if (trimmed.length > 0 && trimmed !== 'any') {
        cells[name] = trimmed;
      }
    }
    if (Object.keys(cells).length > 0) {
      rule.when = cells;
    }
  }

  if (scorecard) {
    const text = row.then[SCALAR_OUTPUT]?.trim() ?? '';
    const numeric = Number(text);
    rule.then = (text.length > 0 && Number.isFinite(numeric)
      ? numeric
      : text) as unknown as PortableContext;
  } else {
    const then: PortableContext = {};
    for (const [name, text] of Object.entries(row.then)) {
      then[name] = text.trim();
    }
    rule.then = then;
  }

  if (row.name !== undefined && row.name.trim().length > 0) {
    rule.name = row.name.trim();
  }
  if (row.priority !== undefined) {
    rule.priority = row.priority;
  }
  return rule;
}

/** A default cell text per output type, so a new row links immediately. */
export function defaultTextForType(typeLabel: string): string {
  switch (typeLabel) {
    case 'number':
      return '0';
    case 'boolean':
      return 'false';
    case 'date':
      return 'date("2000-01-01")';
    case 'time':
      return 'time("00:00:00")';
    case 'datetime':
      return 'datetime("2000-01-01T00:00:00")';
    case 'duration':
      return 'duration("P0D")';
    case 'period':
      return 'period("P0M")';
    case 'string':
    default:
      return "''";
  }
}

export function emptyRow(model: DecisionTableModel): DecisionTableRow {
  const cells = Object.fromEntries(model.inputs.map((column) => [column.name, '']));
  const then = Object.fromEntries(
    model.outputs.map((column) => [
      column.name,
      model.scorecard ? '0' : defaultTextForType(column.typeLabel),
    ]),
  );
  const row: DecisionTableRow = { when: { kind: 'cells', cells }, then };
  if (model.hitPolicy === 'best-match') {
    row.priority = model.rows.reduce((max, r) => Math.max(max, r.priority ?? 0), 0) + 1;
  }
  return row;
}

/** Clones a definition with a new rule list (all other `@` fields preserved). */
export function withRules(
  definition: PortableRulesetDefinition,
  rules: PortableRule[],
): PortableRulesetDefinition {
  return { ...definition, '@rules': rules };
}

/**
 * Clones a definition with a new hit policy, reconciling the fields the engine validates:
 * `collect-matches` forbids `@default`; `best-match` requires a `priority` on every rule and
 * every other policy rejects it.
 */
export function withHitPolicy(
  definition: PortableRulesetDefinition,
  hitPolicy: HitPolicy,
): PortableRulesetDefinition {
  const next: PortableRulesetDefinition = { ...definition, '@hitPolicy': hitPolicy };
  if (hitPolicy === 'collect-matches') {
    delete next['@default'];
  }
  if (hitPolicy === 'best-match') {
    next['@rules'] = definition['@rules'].map((rule, index) => ({
      ...rule,
      priority: rule.priority ?? index + 1,
    }));
  } else {
    next['@rules'] = definition['@rules'].map((rule) => {
      const { priority: _priority, ...rest } = rule;
      return rest as PortableRule;
    });
  }
  return next;
}

function mapThens(
  definition: PortableRulesetDefinition,
  transform: (then: PortableContext) => PortableContext,
): PortableRulesetDefinition {
  const next: PortableRulesetDefinition = {
    ...definition,
    '@rules': definition['@rules'].map((rule) =>
      isContextNode(rule.then) ? { ...rule, then: transform({ ...rule.then }) } : rule,
    ),
  };
  const defaultNode = definition['@default'];
  if (defaultNode && isContextNode(defaultNode)) {
    next['@default'] = transform({ ...defaultNode });
  }
  return next;
}

export function withOutputColumnAdded(
  definition: PortableRulesetDefinition,
  name: string,
  cellText?: string,
): PortableRulesetDefinition {
  const text = cellText ?? "''";
  return mapThens(definition, (then) => ({ ...then, [name]: text }));
}

export function withOutputColumnRemoved(
  definition: PortableRulesetDefinition,
  name: string,
): PortableRulesetDefinition {
  return mapThens(definition, (then) => {
    const { [name]: _removed, ...rest } = then;
    return rest as PortableContext;
  });
}

export function withOutputColumnRenamed(
  definition: PortableRulesetDefinition,
  from: string,
  to: string,
): PortableRulesetDefinition {
  return mapThens(definition, (then) =>
    Object.fromEntries(
      Object.entries(then).map(([key, value]) => [key === from ? to : key, value]),
    ) as PortableContext,
  );
}

/** Reorders `then`/`default` fields to `order` (any fields not listed keep their relative position at the end). */
export function withOutputColumnsReordered(
  definition: PortableRulesetDefinition,
  order: string[],
): PortableRulesetDefinition {
  return mapThens(definition, (then) => {
    const next: PortableContext = {};
    for (const name of order) {
      if (Object.prototype.hasOwnProperty.call(then, name)) {
        next[name] = then[name];
      }
    }
    for (const [key, value] of Object.entries(then)) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        next[key] = value;
      }
    }
    return next;
  });
}

/**
 * A JS identifier shape: what the engine accepts as a field/parameter name. Client-side gate
 * before writing — the engine still validates and may reject reserved words the editor doesn't
 * know about, in which case the write fails and the existing error path (`applyDefinition`)
 * surfaces the engine's message.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidColumnName(name: string): boolean {
  return IDENTIFIER_PATTERN.test(name);
}

/** A default value per parameter type, so a new input column doesn't break existing call sites. */
function defaultValueForType(type: PortableTypeReference): PortableTypedValue['default'] {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      return '';
  }
}

export function withInputColumnAdded(
  definition: PortableRulesetDefinition,
  name: string,
  type: PortableTypeReference,
): PortableRulesetDefinition {
  const parameter: PortableTypedValue = { '@kind': 'type', type, default: defaultValueForType(type) };
  return { ...definition, '@parameters': { ...definition['@parameters'], [name]: parameter } };
}

export function withInputColumnRemoved(
  definition: PortableRulesetDefinition,
  name: string,
): PortableRulesetDefinition {
  const { [name]: _removed, ...parameters } = definition['@parameters'];
  return {
    ...definition,
    '@parameters': parameters,
    '@rules': definition['@rules'].map((rule) => {
      if (!rule.when || isExpressionNode(rule.when)) {
        return rule;
      }
      const { [name]: _cell, ...cells } = rule.when;
      return { ...rule, when: Object.keys(cells).length > 0 ? cells : undefined };
    }),
  };
}

/**
 * Renames an input column: the `@parameters` key and every `cells`-form `when` key that
 * references it. This is a **fallback** for services without `rename` support — prefer
 * `service.rename('<path>.parameters.<name>', '<path>.parameters.<newName>')`, which the engine
 * now relinks fully (cell-map `when`, boolean-expression `when`, and named-argument call sites
 * anywhere in the model; see docs/BUG_REPORTS.md history). This client-side rewrite only covers
 * `@parameters` and cell-map `when` rows: boolean-expression `when` rows and any external
 * named-argument call site that still references the old name are **not** rewritten and must be
 * fixed manually (the engine will report an unresolved-reference/link error on the next write
 * touching them, not silently).
 */
export function withInputColumnRenamed(
  definition: PortableRulesetDefinition,
  from: string,
  to: string,
): PortableRulesetDefinition {
  const parameters = Object.fromEntries(
    Object.entries(definition['@parameters']).map(([key, value]) => [key === from ? to : key, value]),
  );
  const rules = definition['@rules'].map((rule) => {
    if (!rule.when || isExpressionNode(rule.when) || !Object.prototype.hasOwnProperty.call(rule.when, from)) {
      return rule;
    }
    const cells = Object.fromEntries(
      Object.entries(rule.when).map(([key, value]) => [key === from ? to : key, value]),
    );
    return { ...rule, when: cells };
  });
  return { ...definition, '@parameters': parameters, '@rules': rules };
}

/** Changes an input column's declared type, keeping the name and re-deriving its default. */
export function withInputColumnTypeChanged(
  definition: PortableRulesetDefinition,
  name: string,
  type: PortableTypeReference,
): PortableRulesetDefinition {
  const parameter: PortableTypedValue = { '@kind': 'type', type, default: defaultValueForType(type) };
  return { ...definition, '@parameters': { ...definition['@parameters'], [name]: parameter } };
}

export function withDefaultRow(
  definition: PortableRulesetDefinition,
  defaultNode: PortableContext | undefined,
): PortableRulesetDefinition {
  const next = { ...definition };
  if (defaultNode === undefined) {
    delete next['@default'];
  } else {
    next['@default'] = defaultNode;
  }
  return next;
}

/** `best-match` priorities: a positive integer (blank/zero/negative/fractional are rejected). */
export function isValidPriority(text: string): boolean {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) && Number(trimmed) > 0;
}

/** True when two or more rows share the same `best-match` priority. */
export function duplicatePriorities(rows: DecisionTableRow[]): Set<number> {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.priority !== undefined) {
      counts.set(row.priority, (counts.get(row.priority) ?? 0) + 1);
    }
  }
  const duplicates = new Set<number>();
  for (const [priority, count] of counts) {
    if (count > 1) {
      duplicates.add(priority);
    }
  }
  return duplicates;
}

// ── `when` cells ↔ boolean expression ───────────────────────────────────────
//
// Converting between the two `when` forms without changing what a rule matches is only possible
// for a bounded subset of the unary-test grammar (see `../../../edgerules-v2/doc/architecture/EBNF.md`
// `UnaryTest`) — a bare identifier cell (`age: isCore`) is genuinely ambiguous without knowing
// whether the model declares `isCore` as a one-parameter function (a named unary test call) or a
// field (a same-named equality target), which this component cannot resolve. Rather than guess and
// risk a *valid but wrong* expression succeeding silently, every function below returns `null` to
// mean "not confidently convertible" and the caller must refuse the operation instead of applying
// a lossy fallback.

const LITERAL_PATTERN = /^(-?\d+(\.\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|true|false)$/;
const COMPARATOR_PATTERN = /^(>=|<=|<>|!=|>|<|=)\s*(.+)$/;
const RANGE_PATTERN = /^(.+?)\.\.(.+)$/;
const NOT_CALL_PATTERN = /^not\s*\((.*)\)$/is;
const IN_PATTERN = /^in\s+(.+)$/i;
const NAMED_ARG_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/;
const PARAM_COMPARATOR_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|<>|!=|>|<|=)\s*(.+)$/;
const CONTAINS_CALL_PATTERN = /^contains\s*\(\s*(.+?)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/is;

/**
 * Splits a unary-test/boolean-expression string into `[term, connective, term, ...]` at its
 * top-level `and`/`or` keywords — respecting parenthesis nesting and skipping keywords that occur
 * inside a quoted string literal (e.g. `segment = "rock and roll"`).
 */
function splitTopLevelConnectives(text: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0) {
      const rest = text.slice(i);
      const isWordBoundaryBefore = i === 0 || !/[A-Za-z0-9_]/.test(text[i - 1]);
      const keyword = isWordBoundaryBefore ? /^(and|or)\b/i.exec(rest) : null;
      if (keyword) {
        tokens.push(text.slice(start, i).trim());
        tokens.push(keyword[1].toLowerCase());
        i += keyword[1].length;
        start = i;
        continue;
      }
    }
    i += 1;
  }
  tokens.push(text.slice(start).trim());
  return tokens;
}

/** Translates one top-level unary-test term (no `and`/`or` of its own) into an expression fragment. */
function translateUnaryTestTerm(param: string, rawTerm: string): string | null {
  const term = rawTerm.trim();
  if (term.length === 0) {
    return null;
  }
  const notMatch = NOT_CALL_PATTERN.exec(term);
  if (notMatch) {
    const inner = translateUnaryTestCell(param, notMatch[1]);
    return inner === null || inner.length === 0 ? null : `not (${inner})`;
  }
  const inMatch = IN_PATTERN.exec(term);
  if (inMatch) {
    return `contains(${inMatch[1].trim()}, ${param})`;
  }
  const comparator = COMPARATOR_PATTERN.exec(term);
  if (comparator) {
    return `${param} ${comparator[1]} ${comparator[2].trim()}`;
  }
  const range = RANGE_PATTERN.exec(term);
  if (range && !range[1].includes('..') && !range[2].includes('..')) {
    return `(${param} >= ${range[1].trim()} and ${param} <= ${range[2].trim()})`;
  }
  if (LITERAL_PATTERN.test(term)) {
    return `${param} = ${term}`;
  }
  // A bare identifier (named-unary-test call vs. equality with a same-named field) is ambiguous
  // without the model's declarations — refuse rather than guess.
  return null;
}

/** Translates one `when` cell's full unary-test text (with its own `and`/`or`) into an expression. */
function translateUnaryTestCell(param: string, cellText: string): string | null {
  const trimmed = cellText.trim();
  if (trimmed.length === 0 || trimmed === 'any') {
    return '';
  }
  const tokens = splitTopLevelConnectives(trimmed);
  const pieces: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const translated = translateUnaryTestTerm(param, tokens[i]);
    if (translated === null) {
      return null;
    }
    pieces.push(translated);
  }
  let result = pieces[0];
  for (let i = 1, c = 1; i < pieces.length; i += 1, c += 2) {
    result += ` ${tokens[c]} ${pieces[i]}`;
  }
  return result;
}

/**
 * Builds a single boolean expression equivalent to a row's `cells` map, or `null` if any non-empty
 * cell isn't confidently translatable (the caller must refuse the conversion rather than fall back
 * to clearing the row — see docs/boxed-editor/bugs-in-decision-table.md DT-001).
 */
export function buildExpressionFromCells(paramNames: string[], cells: Record<string, string>): string | null {
  const pieces: string[] = [];
  for (const param of paramNames) {
    const translated = translateUnaryTestCell(param, cells[param] ?? '');
    if (translated === null) {
      return null;
    }
    if (translated.length > 0) {
      pieces.push(`(${translated})`);
    }
  }
  return pieces.length > 0 ? pieces.join(' and ') : 'true';
}

/** Reverse of a single translated term: `age >= 18` → `{param: 'age', text: '>= 18'}`. */
function parseUnaryTestTerm(
  paramNames: string[],
  rawTerm: string,
): {param: string; text: string} | null {
  const term = rawTerm.trim();
  if (term.length === 0) {
    return null;
  }
  const notMatch = NOT_CALL_PATTERN.exec(term);
  if (notMatch) {
    const innerTokens = splitTopLevelConnectives(notMatch[1]);
    if (innerTokens.length !== 1) {
      return null; // nested and/or inside not(...) isn't confidently reversible
    }
    const inner = parseUnaryTestTerm(paramNames, innerTokens[0]);
    return inner === null ? null : {param: inner.param, text: `not(${inner.text})`};
  }
  const containsMatch = CONTAINS_CALL_PATTERN.exec(term);
  if (containsMatch && paramNames.includes(containsMatch[2])) {
    return {param: containsMatch[2], text: `in ${containsMatch[1].trim()}`};
  }
  const namedArg = NAMED_ARG_PATTERN.exec(term);
  if (namedArg && paramNames.includes(namedArg[2])) {
    return {param: namedArg[2], text: namedArg[1]};
  }
  const comparator = PARAM_COMPARATOR_PATTERN.exec(term);
  if (comparator && paramNames.includes(comparator[1])) {
    const op = comparator[2] === '<>' ? '!=' : comparator[2];
    return {param: comparator[1], text: `${op} ${comparator[3].trim()}`};
  }
  return null;
}

/**
 * Decomposes a boolean-expression `when` into a per-column `cells` map, or `null` if it can't be
 * represented that way without changing its meaning — most commonly a top-level `or` across two
 * *different* parameters (DT-002's reported case, `age >= 65 or segment = "premium"`), which has
 * no equivalent AND-of-cells form. A single-parameter `or` (`age: > 500 or < 10`) is still
 * convertible. Mixed `and`/`or` at the top level is refused outright — resolving that correctly
 * needs real operator-precedence parsing, and guessing wrong would silently change the rule.
 */
export function parseExpressionToCells(paramNames: string[], expressionText: string): Record<string, string> | null {
  const trimmed = expressionText.trim();
  if (trimmed.length === 0 || trimmed === 'true') {
    return {};
  }
  const tokens = splitTopLevelConnectives(trimmed);
  const terms: string[] = [];
  const connectives: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    terms.push(tokens[i]);
    if (i + 1 < tokens.length) {
      connectives.push(tokens[i + 1]);
    }
  }
  const parsed = terms.map((term) => parseUnaryTestTerm(paramNames, term));
  if (parsed.some((entry) => entry === null)) {
    return null;
  }
  const entries = parsed as Array<{param: string; text: string}>;
  const uniqueConnectives = new Set(connectives);
  if (uniqueConnectives.size > 1) {
    return null; // mixed and/or at the top level — ambiguous without a real parser
  }

  if (uniqueConnectives.size === 0 || connectives[0] === 'and') {
    const byParam = new Map<string, string[]>();
    for (const {param, text} of entries) {
      const texts = byParam.get(param) ?? [];
      texts.push(text);
      byParam.set(param, texts);
    }
    const cells: Record<string, string> = {};
    for (const [param, texts] of byParam) {
      cells[param] = texts.join(' and ');
    }
    return cells;
  }

  // A top-level `or`: only representable as a single cell if every term names the same parameter.
  const params = new Set(entries.map((entry) => entry.param));
  if (params.size !== 1) {
    return null;
  }
  const [param] = params;
  return {[param]: entries.map((entry) => entry.text).join(' or ')};
}

/** `(age: number, income: number, segment: string)` — the typed signature for display and embed contexts. */
export function parameterSignature(definition: PortableRulesetDefinition): string {
  return Object.entries(definition['@parameters'])
    .map(([name, type]) => {
      const label = typeLabelOf(type);
      return label.length > 0 ? `${name}: ${label}` : name;
    })
    .join(', ');
}

/**
 * Embed context validating a unary-test cell in a synthesized one-rule ruleset with this
 * table's signature, so `18..25` / `> 30000` / named tests lint and complete correctly.
 */
export function whenCellEmbedContext(
  definition: PortableRulesetDefinition,
  parameter: string,
): CodeEditorEmbedContext {
  const signature = parameterSignature(definition);
  return {
    prefix: `{ ruleset __cell(${signature}): { hitPolicy: "first-match" rules: [ { when: { ${parameter}: `,
    suffix: ' }, then: { __r: 1 } } ] } }',
  };
}

/** Embed context for a boolean-expression `when` (parameters in scope, boolean expected). */
export function whenExpressionEmbedContext(
  definition: PortableRulesetDefinition,
): CodeEditorEmbedContext {
  const signature = parameterSignature(definition);
  return {
    prefix: `{ ruleset __cell(${signature}): { hitPolicy: "first-match" rules: [ { when: `,
    suffix: ', then: { __r: 1 } } ] } }',
  };
}

/** Embed context for a `then` / default output cell (parameters in scope as function args). */
export function thenCellEmbedContext(
  definition: PortableRulesetDefinition,
): CodeEditorEmbedContext {
  const signature = parameterSignature(definition);
  return {
    prefix: `{ func __cell(${signature}): `,
    suffix: ' }',
  };
}
