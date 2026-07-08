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
function defaultTextForType(typeLabel: string): string {
  switch (typeLabel) {
    case 'number':
      return '0';
    case 'boolean':
      return 'false';
    case 'string':
      return "''";
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

function parameterSignature(definition: PortableRulesetDefinition): string {
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
