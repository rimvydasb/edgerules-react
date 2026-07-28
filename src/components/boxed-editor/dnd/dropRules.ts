import type { BoxedRowData, BoxedRowKind } from '../boxed-editor-types';
import { parentPath } from '../service/portable-utils';

/** Coarse shape of a scalar DSL literal, used to approximate "matching element type" for
 * `list-item` drops — the engine itself is the real type authority (a genuinely mismatched drop
 * still comes back as a `PortableError` from `move()`); this is only good enough to gate the
 * preview and avoid an obviously-doomed drop. */
export type LiteralKind = 'string' | 'number' | 'boolean' | 'other';

export function inferLiteralKind(value: string | undefined): LiteralKind {
  const trimmed = (value ?? '').trim();
  if (/^(['"]).*\1$/.test(trimmed)) return 'string';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'number';
  if (trimmed === 'true' || trimmed === 'false') return 'boolean';
  return 'other';
}

/** The `BoxedRowKind`s a handle can drag — every other kind renders via `SettingRow`'s gear icon
 * (never draggable) or is the fixed `model` root. */
const MOVABLE_KINDS: ReadonlySet<BoxedRowKind> = new Set<BoxedRowKind>([
  'field',
  'context',
  'complexType',
  'list',
  'relation',
  'function',
  'ruleset',
  'optimisation',
  'list-item',
  'relation-item',
  'rule',
  'optimisation-variable',
  'optimisation-constraint',
]);

export function isMovableKind(kind: BoxedRowKind): boolean {
  return MOVABLE_KINDS.has(kind);
}

/**
 * The path of the row that structurally owns `row` — identical to `parentPath` for every kind
 * except `rule`, whose CRUD path (`<ruleset>.rules[i]`) runs through the synthetic `.rules`
 * indexing prefix `loadRows` invents (`createBoxedEditorService.ts`); its real container for
 * drop-matrix purposes is the `ruleset` one level further up.
 */
export function containerPathFor(row: Pick<BoxedRowData, 'path' | 'kind'>): string {
  const parent = parentPath(row.path) ?? '*';
  if (row.kind === 'rule') return parentPath(parent) ?? '*';
  return parent;
}

/** Everything `isValidDrop` needs about the dragged row, captured once at drag start. */
export interface DragPayload {
  path: string;
  kind: BoxedRowKind;
  /** `containerPathFor(row)` — this row's own current parent. */
  containerPath: string;
  containerKind: BoxedRowKind;
  /** `relation-item`'s own `columns`, for the "matching columns" check. */
  columns?: string[];
  /** `list-item`'s own value shape, for the "matching element type" check. */
  literalKind?: LiteralKind;
}

/** Everything `isValidDrop` needs about a candidate destination — either an existing sibling row
 * (insert near it, within its own container) or a container's trailing append marker. */
export interface DropTargetPayload {
  containerPath: string;
  containerKind: BoxedRowKind;
  /** Insertion index within `containerPath`'s relevant children (see `useRowDrop`'s sibling
   * bookkeeping — filtered to same-kind siblings only for a `ruleset`'s mixed `children`). */
  index: number;
  /** The destination `relation`'s own `columns`, when `containerKind === 'relation'`. */
  columns?: string[];
  /** A representative shape sampled from the destination `list`'s existing items, when
   * `containerKind === 'list'`. `undefined` when the list is empty — accepts anything. */
  literalKind?: LiteralKind;
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}

/** Rejects a drop that would nest a container inside its own subtree (dragging `a` onto a
 * descendant of `a`) — mechanically caught by the engine too, but worth short-circuiting here so
 * the preview never invites an obviously self-defeating drop. */
function isOwnDescendant(source: DragPayload, target: DropTargetPayload): boolean {
  return (
    target.containerPath === source.path ||
    target.containerPath.startsWith(`${source.path}.`) ||
    target.containerPath.startsWith(`${source.path}[`)
  );
}

/**
 * The single pure predicate the §4 matrix compiles to — shared by the drag preview (`useRowDrop`)
 * and the `move()` dispatch (`BoxedEditor`'s `onDragEnd`), so the two can never disagree.
 */
export function isValidDrop(source: DragPayload, target: DropTargetPayload): boolean {
  switch (source.kind) {
    case 'field':
      if (isOwnDescendant(source, target)) return false;
      return source.containerKind === 'complexType'
        ? target.containerKind === 'complexType'
        : target.containerKind === 'context' || target.containerKind === 'model';
    case 'context':
    case 'complexType':
    case 'list':
    case 'relation':
    case 'function':
    case 'ruleset':
      if (isOwnDescendant(source, target)) return false;
      return target.containerKind === 'context' || target.containerKind === 'model';
    case 'optimisation':
      if (isOwnDescendant(source, target)) return false;
      return target.containerKind === 'model';
    case 'list-item':
      if (target.containerKind !== 'list') return false;
      if (target.literalKind === undefined || source.literalKind === undefined) return true;
      return target.literalKind === source.literalKind;
    case 'relation-item': {
      if (target.containerKind !== 'relation') return false;
      const targetColumns = target.columns ?? [];
      if (targetColumns.length === 0) return true;
      return sameMembers(source.columns ?? [], targetColumns);
    }
    case 'rule':
      return target.containerKind === 'ruleset' && target.containerPath === source.containerPath;
    case 'optimisation-variable':
      return (
        target.containerKind === 'optimisation-variable-group' &&
        target.containerPath === source.containerPath
      );
    case 'optimisation-constraint':
      return (
        target.containerKind === 'optimisation-constraint-group' &&
        target.containerPath === source.containerPath
      );
    default:
      // Non-draggable kinds never produce a `DragPayload` in the first place (`isMovableKind`
      // gates `useRowDrag`) — kept exhaustive as a defensive fallback.
      return false;
  }
}
