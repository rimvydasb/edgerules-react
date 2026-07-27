import type {
  BoxedRowData,
  BoxedRowKind,
  BoxedTableRowData,
} from '../boxed-editor-types';
import { childPath, indexedPath, pathDepth } from '../service/portable-utils';

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

function uniqueName(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}

/**
 * The blank, uniquely-named `field` a container's trailing `NewRow` placeholder appends —
 * `model`/`context`/`complexType` bodies are name-keyed, so a fresh field is always a plain
 * `set` at a new path, never a whole-parent rewrite (Resolved: `NewEntity` inserts).
 */
export function nextFieldRow(
  container: Pick<BoxedRowData, 'path' | 'children'>,
): BoxedRowData {
  const existing = new Set((container.children ?? []).map((child) => child.name));
  const name = uniqueName('field', existing);
  const path = childPath(container.path, name);
  return rowFactories.field!(path, name, pathDepth(path));
}

/** Appends a blank `list-item` and returns the whole `list` row for a parent rewrite. */
export function appendListItem(row: BoxedRowData): BoxedRowData {
  const children = row.children ?? [];
  const index = children.length;
  const path = indexedPath(row.path, index);
  const item = rowFactories['list-item']!(path, `Item ${index + 1}`, pathDepth(path));
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
 * Appends `columnName` to the header and to every record (blank cell), and returns the whole
 * `relation` row for a parent rewrite.
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
        cells: [...(table.cells ?? []), ''],
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
