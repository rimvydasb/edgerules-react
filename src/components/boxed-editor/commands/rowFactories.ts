import type { BoxedRowData, BoxedRowKind } from '../boxed-editor-types';

export type RowFactory = (path: string, name: string, depth: number) => BoxedRowData;

/**
 * Default `BoxedRowData` for each `Add…` / `Convert to…` action, keyed by the row kind it
 * produces. The menu layer (Phase 5) only has to pick a factory and a target path; extend this
 * map as later phases add the remaining kinds (`function`, `ruleset`, `optimisation`, `list`,
 * `relation`, ...).
 */
export const rowFactories: Partial<Record<BoxedRowKind, RowFactory>> = {
  field: (path, name, depth) => ({
    kind: 'field',
    depth,
    path,
    name,
    value: '',
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
};
