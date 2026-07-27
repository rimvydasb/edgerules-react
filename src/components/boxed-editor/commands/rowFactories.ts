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
