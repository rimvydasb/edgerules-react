import type {
  BoxedRowData,
  BoxedRowKind,
  BoxedTableRowData,
} from '../boxed-editor-types';
import { childPath, indexedPath, parentPath, pathDepth } from '../service/portable-utils';

export type RowFactory = (path: string, name: string, depth: number) => BoxedRowData;

// A brand-new scalar (`field`/`list-item`) needs *some* valid DSL literal — a blank expression
// string is a parse error at its slot (a context can omit an unset field, but a positional array
// element or a freshly-inserted field cannot be blank). An empty string literal is the least
// surprising default: visually blank, and immediately editable via the cell it renders in.
const BLANK_LITERAL = '""';

/**
 * Default `BoxedRowData` for each `Add…` / `Convert to…` action, keyed by the row kind it
 * produces. The menu layer (Phase 5) only has to pick a factory and a target path; extend this
 * map as later phases add the remaining kinds (`function`, `ruleset`, `optimisation`, ...).
 */
export const rowFactories: Partial<Record<BoxedRowKind, RowFactory>> = {
  field: (path, name, depth) => ({
    kind: 'field',
    depth,
    path,
    name,
    value: BLANK_LITERAL,
  }),
  context: (path, name, depth) => ({
    kind: 'context',
    depth,
    path,
    name,
    children: [],
  }),
  complexType: (path, name, depth) => ({
    kind: 'complexType',
    depth,
    path,
    name,
    children: [],
  }),
  list: (path, name, depth) => ({
    kind: 'list',
    depth,
    path,
    name,
    children: [],
  }),
  'list-item': (path, name, depth) => ({
    kind: 'list-item',
    depth,
    path,
    name,
    value: BLANK_LITERAL,
  }),
  relation: (path, name, depth): BoxedTableRowData => ({
    kind: 'relation',
    depth,
    path,
    name,
    columns: [],
    children: [],
  }),
  'relation-item': (path, name, depth): BoxedTableRowData => ({
    kind: 'relation-item',
    depth,
    path,
    name,
    columns: [],
    cells: [],
  }),
  rule: (path, name, depth): BoxedTableRowData => ({
    kind: 'rule',
    depth,
    path,
    name,
    conditionColumns: [],
    actionColumns: [],
    conditions: [],
    actions: [],
  }),
  'optimisation-variable': (path, name, depth) => ({
    kind: 'optimisation-variable',
    depth,
    path,
    name,
    value: '<number, min: 0>',
  }),
  'optimisation-constraint': (path, name, depth) => ({
    kind: 'optimisation-constraint',
    depth,
    path,
    name,
    value: '0 <= 0',
  }),
};

export function uniqueName(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}

/**
 * The blank, uniquely-named `field` a container's trailing `NewRow` placeholder appends —
 * `model`/`context`/`function` bodies are name-keyed, so a fresh field there is a plain `set` at a
 * new path. A `complexType` body is name-keyed too, but its members aren't individually
 * addressable at all (`createBoxedEditorService`'s `complexTypeOwner` always coalesces them into a
 * whole-type rewrite), and a member's node is a bare type reference, never `BLANK_LITERAL`'s
 * string-expression default — so `isTypeMember` seeds a real (if generic) type name instead.
 */
export function nextFieldRow(
  container: Pick<BoxedRowData, 'path' | 'children'>,
  isTypeMember = false,
): BoxedRowData {
  const existing = new Set((container.children ?? []).map((child) => child.name));
  const name = uniqueName('field', existing);
  const path = childPath(container.path, name);
  const field = rowFactories.field!(path, name, pathDepth(path));
  return isTypeMember ? { ...field, value: 'string' } : field;
}

function compatibleListItemDefault(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return '0';
  if (trimmed === 'true' || trimmed === 'false') return 'false';
  if (/^(['"]).*\1$/.test(trimmed)) return BLANK_LITERAL;
  return trimmed || BLANK_LITERAL;
}

/**
 * Appends a type-compatible `list-item` and returns the whole `list` row for a parent rewrite.
 * EdgeRules lists are homogeneous, so always seeding `BLANK_LITERAL` would make appending to a
 * numeric or boolean list fail before the new cell can be edited.
 */
export function appendListItem(row: BoxedRowData): BoxedRowData {
  const children = row.children ?? [];
  const index = children.length;
  const path = indexedPath(row.path, index);
  const item = {
    ...rowFactories['list-item']!(path, `Item ${index + 1}`, pathDepth(path)),
    value: compatibleListItemDefault(children.at(-1)?.value),
  };
  return { ...row, children: [...children, item] };
}

/**
 * Appends a blank `relation-item` — its cells aligned to the header's `columns` — and returns
 * the whole `relation` row for a parent rewrite. Cells default to `BLANK_LITERAL` rather than an
 * omitted (`''`) field: the engine currently requires every array element to share one identical
 * structural type, so a genuinely blank record (nothing authored at all) is rejected as a type
 * mismatch against existing records that do author every column — see `docs/BUG_REPORTS.md`
 * ("Array-typed fields reject elements with differing optional-field shapes"). Authoring an
 * empty-string literal for every column at least matches a `string`-typed column; a
 * non-`string`-typed column still needs the user's first real edit before it round-trips.
 */
export function appendRelationItem(row: BoxedTableRowData): BoxedTableRowData {
  const children = row.children ?? [];
  const index = children.length;
  const path = indexedPath(row.path, index);
  const columns = row.columns ?? [];
  const item: BoxedTableRowData = {
    ...(rowFactories['relation-item']!(
      path,
      `Item ${index + 1}`,
      pathDepth(path),
    ) as BoxedTableRowData),
    columns,
    cells: columns.map(() => BLANK_LITERAL),
  };
  return { ...row, children: [...children, item] };
}

/**
 * Appends `columnName` to the header and to every record, and returns the whole `relation` row
 * for a parent rewrite. Backfills `BLANK_LITERAL` rather than an omitted (`''`) cell — a truly
 * blank cell authors nothing at all (`recordFromCells` skips empty values), so on the very next
 * read `columnsOf` would no longer see any record actually declaring the new column, and it would
 * vanish (same reasoning as `appendRelationItem`'s own doc comment).
 */
export function addRelationColumn(
  row: BoxedTableRowData,
  columnName: string,
): BoxedTableRowData {
  return {
    ...row,
    columns: [...(row.columns ?? []), columnName],
    children: (row.children ?? []).map((child) => {
      const table = child as BoxedTableRowData;
      return {
        ...table,
        columns: [...(table.columns ?? []), columnName],
        cells: [...(table.cells ?? []), BLANK_LITERAL],
      };
    }),
  };
}

/**
 * Removes `columnName` from the header and from every record, and returns the whole `relation`
 * row for a parent rewrite. A no-op if the column is already absent.
 */
export function removeRelationColumn(
  row: BoxedTableRowData,
  columnName: string,
): BoxedTableRowData {
  const index = (row.columns ?? []).indexOf(columnName);
  if (index === -1) return row;
  return {
    ...row,
    columns: (row.columns ?? []).filter((name) => name !== columnName),
    children: (row.children ?? []).map((child) => {
      const table = child as BoxedTableRowData;
      const cells = [...(table.cells ?? [])];
      cells.splice(index, 1);
      return {
        ...table,
        columns: (table.columns ?? []).filter((name) => name !== columnName),
        cells,
      };
    }),
  };
}

/**
 * Appends a blank `rule` — its condition/action columns aligned to the owning `ruleset`'s own,
 * inserted just before the `ruleset-default` row when one is present — and returns the whole
 * `ruleset` row for a parent rewrite (rules are addressed positionally; an append can't be a
 * single-path `set` the way a name-keyed context field can). Action cells seed from the first
 * existing rule (or `default`) rather than a blind `BLANK_LITERAL`: `then` shapes must match
 * exactly across every rule and `default` (`RULESETS_REFERENCE.md`), and action columns are
 * commonly typed heterogeneously (e.g. a string `level` beside a numeric `limit`) — copying a
 * known-good row keeps every column's literal valid for its column instead of guessing.
 */
export function appendRule(row: BoxedTableRowData): BoxedTableRowData {
  const children = row.children ?? [];
  const rules = children.filter((child) => child.kind === 'rule') as BoxedTableRowData[];
  const fallback = children.find((child) => child.kind === 'ruleset-default') as
    | BoxedTableRowData
    | undefined;
  const referenceActions = rules[0]?.actions ?? fallback?.actions;
  const path = indexedPath(childPath(row.path, 'rules'), rules.length);
  const conditionColumns = row.conditionColumns ?? [];
  const actionColumns = row.actionColumns ?? [];
  const rule: BoxedTableRowData = {
    ...(rowFactories.rule!(
      path,
      `Rule ${rules.length + 1}`,
      pathDepth(path),
    ) as BoxedTableRowData),
    conditionColumns,
    actionColumns,
    conditions: conditionColumns.map(() => ''),
    actions: referenceActions ?? actionColumns.map(() => BLANK_LITERAL),
  };
  const insertAt = children.findIndex((child) => child.kind === 'ruleset-default');
  const nextChildren =
    insertAt === -1
      ? [...children, rule]
      : [...children.slice(0, insertAt), rule, ...children.slice(insertAt)];
  return { ...row, children: nextChildren };
}

/**
 * Appends a blank, uniquely-named `optimisation-variable` and returns the whole
 * `optimisation-variable-group` row for a parent rewrite — the service coalesces a write at the
 * group's path into the owning `optimise` declaration (Section 7).
 */
export function appendOptimisationVariable(row: BoxedRowData): BoxedRowData {
  const children = row.children ?? [];
  const existing = new Set(children.map((child) => child.name));
  const name = uniqueName('variable', existing);
  const path = childPath(row.path, name);
  const variable = rowFactories['optimisation-variable']!(path, name, pathDepth(path));
  return { ...row, children: [...children, variable] };
}

/**
 * Appends a blank, uniquely-named `optimisation-constraint` and returns the whole
 * `optimisation-constraint-group` row for a parent rewrite.
 */
export function appendOptimisationConstraint(row: BoxedRowData): BoxedRowData {
  const children = row.children ?? [];
  const existing = new Set(children.map((child) => child.name));
  const name = uniqueName('constraint', existing);
  const path = childPath(row.path, name);
  const constraint = rowFactories['optimisation-constraint']!(path, name, pathDepth(path));
  return { ...row, children: [...children, constraint] };
}

/**
 * `Add Variable` on an `optimisation-variable-group` — unlike `Add Constraint`, a bare new variable
 * can't be appended alone: one declared but never referenced by the objective or a constraint is
 * rejected at link time (`E339`), so this seeds a trivial companion constraint (`<name> >= 0`) in
 * the *same* commit, referencing the new variable — a harmless placeholder bound the user edits
 * away like any other seeded default. Takes (and returns) the whole `optimisation` row, since the
 * commit has to update both the `variables` and `constraints` groups together.
 */
export function addOptimisationVariable(row: BoxedTableRowData): BoxedTableRowData {
  const children = row.children ?? [];
  const variableGroup = children.find((child) => child.kind === 'optimisation-variable-group');
  const constraintGroup = children.find((child) => child.kind === 'optimisation-constraint-group');
  if (!variableGroup || !constraintGroup) return row;

  const updatedVariableGroup = appendOptimisationVariable(variableGroup);
  const variableName = updatedVariableGroup.children?.[updatedVariableGroup.children.length - 1]?.name;
  if (!variableName) return row;

  const constraintNames = new Set((constraintGroup.children ?? []).map((child) => child.name));
  const constraintName = uniqueName(`${variableName}Bound`, constraintNames);
  const constraintPath = childPath(constraintGroup.path, constraintName);
  const updatedConstraintGroup: BoxedRowData = {
    ...constraintGroup,
    children: [
      ...(constraintGroup.children ?? []),
      {
        kind: 'optimisation-constraint',
        depth: pathDepth(constraintPath),
        path: constraintPath,
        name: constraintName,
        value: `${variableName} >= 0`,
      },
    ],
  };

  return {
    ...row,
    children: children.map((child) => {
      if (child.kind === 'optimisation-variable-group') return updatedVariableGroup;
      if (child.kind === 'optimisation-constraint-group') return updatedConstraintGroup;
      return child;
    }),
  };
}

// --- Duplicate ---------------------------------------------------------------------------

function remapPaths(row: BoxedRowData, fromPath: string, toPath: string): BoxedRowData {
  const path = toPath + row.path.slice(fromPath.length);
  return {
    ...row,
    path,
    depth: pathDepth(path),
    children: row.children?.map((child) => remapPaths(child, fromPath, toPath)),
  };
}

/**
 * `Duplicate` for a **named** kind (`field`, `context`, `complexType`, `function`, `ruleset`,
 * `optimisation`, `optimisation-variable`, `optimisation-constraint`) — auto-renames to avoid
 * colliding with the source (`chairs` -> `chairs2`) and remaps every descendant path under the new
 * name, but is otherwise a **plain `set` at a new path**: these bodies are name-keyed (same
 * reasoning as `nextFieldRow`), so there is no whole-parent rewrite to perform, and — for an
 * `optimisation` child — the facade's owner-coalescing already applies to whatever path this
 * writes to, exactly as it does for any other child edit (Section 7).
 */
export function duplicateNamedRow(
  row: BoxedRowData,
  siblingNames: Set<string>,
): { path: string; row: BoxedRowData } {
  const name = uniqueName(row.name, siblingNames);
  const parent = parentPath(row.path) ?? '*';
  const path = childPath(parent, name);
  return { path, row: remapPaths({ ...row, name }, row.path, path) };
}

/**
 * `Duplicate` for a **positional** kind (`list-item`, `relation-item`, `rule`) — inserts a copy
 * directly after `targetPath` in `children` (which may hold other kinds alongside it, e.g. a
 * `ruleset`'s `ruleset-hit-policy`/`ruleset-default`) with no rename, since array position — not a
 * name — is the identity here. The caller commits the **whole container** at its own path
 * (`setBoxedRowData`) — arrays are append-only and reject gaps, so every sibling must be rewritten
 * together.
 */
export function duplicateChildAt(
  children: BoxedRowData[],
  targetPath: string,
): BoxedRowData[] {
  const index = children.findIndex((child) => child.path === targetPath);
  if (index === -1) return children;
  return [
    ...children.slice(0, index + 1),
    { ...children[index] },
    ...children.slice(index + 1),
  ];
}

// --- Function / Optimisation arguments ----------------------------------------------------

/**
 * `Add Argument` on a `function`/`optimisation` — appends a uniquely-named parameter. `type` is
 * left untyped for a `function` (its arguments may be `null`-typed); an `optimise` parameter must
 * carry a real type annotation (`E331`), so the caller passes one for that case.
 */
export function addArgument(row: BoxedTableRowData, type?: string): BoxedTableRowData {
  const existing = new Set((row.parameters ?? []).map((parameter) => parameter.name));
  const name = uniqueName('arg', existing);
  return { ...row, parameters: [...(row.parameters ?? []), { name, ...(type ? { type } : {}) }] };
}

/** `Delete "‹argument›" Argument` — also the cleared-argument-name special action (Section 5). */
export function removeArgument(row: BoxedTableRowData, name: string): BoxedTableRowData {
  return {
    ...row,
    parameters: (row.parameters ?? []).filter((parameter) => parameter.name !== name),
  };
}

// --- Ruleset condition / action columns ---------------------------------------------------

/**
 * `Add Condition Column` — a ruleset's condition columns *are* its `@parameters` signature
 * (`normalizeRuleset`'s `conditionColumns = parameters.map(p => p.name)`), so this appends a
 * parameter and extends every cell-map-style rule's `conditions` with a blank ("any") entry.
 * A boolean-expression-style rule (`conditionsExpression` set) has no per-column cells to extend.
 * Unlike a `function`'s argument, a ruleset parameter must carry a real type annotation (`E301`) —
 * `string` is the least surprising default; the user retypes it via the column header like any
 * other parameter.
 */
export function addConditionColumn(row: BoxedTableRowData, columnName: string): BoxedTableRowData {
  const parameters = [...(row.parameters ?? []), { name: columnName, type: 'string' }];
  const conditionColumns = parameters.map((parameter) => parameter.name);
  return {
    ...row,
    parameters,
    conditionColumns,
    children: (row.children ?? []).map((child) => {
      if (child.kind !== 'rule') return child;
      const table = child as BoxedTableRowData;
      if (table.conditionsExpression !== undefined) return { ...table, conditionColumns };
      return { ...table, conditionColumns, conditions: [...(table.conditions ?? []), ''] };
    }),
  };
}

/** `Delete "‹column›" Column` for a condition column — the inverse of `addConditionColumn`. */
export function removeConditionColumn(
  row: BoxedTableRowData,
  columnName: string,
): BoxedTableRowData {
  const index = (row.parameters ?? []).findIndex((parameter) => parameter.name === columnName);
  if (index === -1) return row;
  const parameters = (row.parameters ?? []).filter((parameter) => parameter.name !== columnName);
  const conditionColumns = parameters.map((parameter) => parameter.name);
  return {
    ...row,
    parameters,
    conditionColumns,
    children: (row.children ?? []).map((child) => {
      if (child.kind !== 'rule') return child;
      const table = child as BoxedTableRowData;
      if (table.conditionsExpression !== undefined) return { ...table, conditionColumns };
      const conditions = [...(table.conditions ?? [])];
      conditions.splice(index, 1);
      return { ...table, conditionColumns, conditions };
    }),
  };
}

/**
 * `Add Action Column` — extends `actionColumns` and every `rule`/`ruleset-default`'s `then` with
 * a blank literal (action columns are pure output shape, not part of `@parameters`).
 */
export function addActionColumn(row: BoxedTableRowData, columnName: string): BoxedTableRowData {
  const actionColumns = [...(row.actionColumns ?? []), columnName];
  return {
    ...row,
    actionColumns,
    children: (row.children ?? []).map((child) => {
      if (child.kind !== 'rule' && child.kind !== 'ruleset-default') return child;
      const table = child as BoxedTableRowData;
      return { ...table, actionColumns, actions: [...(table.actions ?? []), BLANK_LITERAL] };
    }),
  };
}

/** `Delete "‹column›" Column` for an action column — the inverse of `addActionColumn`. */
export function removeActionColumn(row: BoxedTableRowData, columnName: string): BoxedTableRowData {
  const index = (row.actionColumns ?? []).indexOf(columnName);
  if (index === -1) return row;
  const actionColumns = (row.actionColumns ?? []).filter((column) => column !== columnName);
  return {
    ...row,
    actionColumns,
    children: (row.children ?? []).map((child) => {
      if (child.kind !== 'rule' && child.kind !== 'ruleset-default') return child;
      const table = child as BoxedTableRowData;
      const actions = [...(table.actions ?? [])];
      actions.splice(index, 1);
      return { ...table, actionColumns, actions };
    }),
  };
}

// --- Convert to Context / Relation / List -----------------------------------------------

/** `Convert to Context / Relation / List` — replaces a `field` with an empty container in place. */
export function convertField(
  row: BoxedRowData,
  kind: 'context' | 'relation' | 'list',
): BoxedRowData {
  const base = { depth: row.depth, path: row.path, name: row.name };
  if (kind === 'relation') {
    return { ...base, kind: 'relation', columns: [], children: [] } as BoxedTableRowData;
  }
  return { ...base, kind, children: [] };
}

// --- Model / Context: Add Function / Add Decision Table / Add Optimisation / Add Relation / Add List --

/** `Add Function` — a fresh inline function, uniquely named, with a blank synthesized result. */
export function nextFunctionRow(
  container: Pick<BoxedRowData, 'path'>,
  existingNames: Set<string>,
): BoxedTableRowData {
  const name = uniqueName('function', existingNames);
  const path = childPath(container.path, name);
  const depth = pathDepth(path);
  return {
    kind: 'function',
    depth,
    path,
    name,
    parameters: [],
    children: [
      {
        kind: 'function-result',
        depth: depth + 1,
        path: childPath(path, 'result'),
        name: 'result',
        value: BLANK_LITERAL,
        readOnly: true,
        deletable: false,
      },
    ],
  };
}

/**
 * `Add Decision Table` — a fresh `ruleset` with no rules yet, `hitPolicy` defaulted. Needs an
 * (empty) `default` fallback from the start: a ruleset with neither rules nor a default has no way
 * to infer its result type (`E308`), so it would be rejected on the very first commit otherwise.
 */
export function nextRulesetRow(
  container: Pick<BoxedRowData, 'path'>,
  existingNames: Set<string>,
): BoxedTableRowData {
  const name = uniqueName('decisionTable', existingNames);
  const path = childPath(container.path, name);
  const depth = pathDepth(path);
  return {
    kind: 'ruleset',
    depth,
    path,
    name,
    parameters: [],
    conditionColumns: [],
    actionColumns: [],
    children: [
      {
        kind: 'ruleset-hit-policy',
        depth: depth + 1,
        path: childPath(path, 'hitPolicy'),
        name: 'hitPolicy',
        value: 'first-match',
        deletable: false,
      },
      {
        kind: 'ruleset-default',
        depth: depth + 1,
        path: childPath(path, 'default'),
        name: 'default',
        actionColumns: [],
        actions: [],
        deletable: false,
      } as BoxedTableRowData,
    ],
  };
}

/** `Add Relation` — a fresh, empty homogeneous collection. */
export function nextRelationRow(
  container: Pick<BoxedRowData, 'path'>,
  existingNames: Set<string>,
): BoxedTableRowData {
  const name = uniqueName('relation', existingNames);
  const path = childPath(container.path, name);
  return { kind: 'relation', depth: pathDepth(path), path, name, columns: [], children: [] };
}

/** `Add List` — a fresh, empty scalar list. */
export function nextListRow(
  container: Pick<BoxedRowData, 'path'>,
  existingNames: Set<string>,
): BoxedRowData {
  const name = uniqueName('list', existingNames);
  const path = childPath(container.path, name);
  return { kind: 'list', depth: pathDepth(path), path, name, children: [] };
}

/**
 * `Add Optimisation` — **model root only** (`optimise` may not be declared nested,
 * `OPTIMISATION_METAPHOR_SPEC.md` §3). Seeds one variable actually referenced by both the
 * objective and a constraint — an unused variable is a link-time error (`E339`), so a blank
 * `optimisation-variable-group` would never commit.
 */
export function nextOptimisationRow(
  container: Pick<BoxedRowData, 'path'>,
  existingNames: Set<string>,
): BoxedTableRowData {
  const name = uniqueName('optimisation', existingNames);
  const path = childPath(container.path, name);
  const depth = pathDepth(path);
  const variablesPath = childPath(path, 'variables');
  const constraintsPath = childPath(path, 'constraints');
  return {
    kind: 'optimisation',
    depth,
    path,
    name,
    parameters: [],
    children: [
      {
        kind: 'optimisation-setting',
        depth: depth + 1,
        path: childPath(path, 'using'),
        name: 'using',
        value: 'highs',
      },
      {
        kind: 'optimisation-variable-group',
        depth: depth + 1,
        path: variablesPath,
        name: 'variables',
        deletable: false,
        children: [
          {
            kind: 'optimisation-variable',
            depth: depth + 2,
            path: childPath(variablesPath, 'x'),
            name: 'x',
            value: '<number, min: 0>',
          },
        ],
      },
      {
        kind: 'optimisation-objective',
        depth: depth + 1,
        path: childPath(path, 'maximise'),
        name: 'maximise',
        value: 'x',
        deletable: false,
      },
      {
        kind: 'optimisation-constraint-group',
        depth: depth + 1,
        path: constraintsPath,
        name: 'constraints',
        deletable: false,
        children: [
          {
            kind: 'optimisation-constraint',
            depth: depth + 2,
            path: childPath(constraintsPath, 'limit'),
            name: 'limit',
            value: 'x <= 100',
          },
        ],
      },
    ],
  };
}
