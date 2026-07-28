import { useId } from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import type { BoxedEditorService, BoxedRowData, BoxedRowKind, BoxedTableRowData } from '../boxed-editor-types';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import {
  containerPathFor,
  inferLiteralKind,
  isMovableKind,
  isValidDrop,
  type DragPayload,
  type DropTargetPayload,
} from './dropRules';

function containerShape(
  service: BoxedEditorService,
  containerPath: string,
  containerKind: BoxedRowKind,
): Pick<DropTargetPayload, 'columns' | 'literalKind'> {
  if (containerKind === 'relation') {
    const row = service.getBoxedRowData(containerPath) as BoxedTableRowData | undefined;
    return { columns: row?.columns ?? [] };
  }
  if (containerKind === 'list') {
    const [first] = service.getBoxedRowsData(containerPath);
    return { literalKind: first ? inferLiteralKind(first.value) : undefined };
  }
  return {};
}

/** Builds the payload for a drop landing directly on `containerPath` at `index` — used both for a
 * sibling row's own insertion point (`useRowDrop`) and `NewRow`'s trailing append marker. */
export function buildContainerDropPayload(
  service: BoxedEditorService,
  containerPath: string,
  index: number,
): DropTargetPayload {
  const containerKind = service.getBoxedRowData(containerPath)?.kind ?? 'model';
  return { containerPath, containerKind, index, ...containerShape(service, containerPath, containerKind) };
}

/** A `ruleset`'s `children` interleave `ruleset-hit-policy`, `rule`s, and `ruleset-default` — the
 * `@rules` array only cares about the `rule`-kind ones, so their insertion index has to be
 * computed against that filtered pool, not the raw mixed list. Every other container's children
 * are already homogeneous (or, for `context`/`model`, correctly ordered as one flat authored
 * object regardless of kind), so the raw index applies there.
 */
function siblingIndex(children: BoxedRowData[], path: string, filterKind?: BoxedRowKind): number {
  const pool = filterKind ? children.filter((child) => child.kind === filterKind) : children;
  const found = pool.findIndex((child) => child.path === path);
  return found === -1 ? pool.length : found;
}

export interface RowDropZone {
  setNodeRef: (element: HTMLElement | null) => void;
  /** A drag is hovering directly over this row's own drop zone. */
  isOver: boolean;
  /** `isOver` **and** the currently dragged row may legally land here per `isValidDrop`. */
  canDrop: boolean;
}

/**
 * Drop-target wiring for one row's own slot — "insert near this row, within its current parent"
 * (`docs/boxed-editor/phase-06-drag-and-drop.md` §4). `row` is optional for the same reason
 * `useRowDrag` takes it as optional (uniform `GenericRow` call sites); a non-movable kind (or no
 * row at all) never anchors a drop.
 */
export function useRowDrop(row: BoxedRowData | undefined): RowDropZone {
  const instanceId = useId();
  const { service, readOnly } = useBoxedEditorContext();
  const { active } = useDndContext();
  const anchorable = row !== undefined && isMovableKind(row.kind) && !readOnly;

  let payload: DropTargetPayload | undefined;
  if (anchorable && row !== undefined) {
    const containerPath = containerPathFor(row);
    const siblings = service.getBoxedRowsData(containerPath);
    const index = siblingIndex(siblings, row.path, row.kind === 'rule' ? 'rule' : undefined);
    payload = buildContainerDropPayload(service, containerPath, index);
  }

  const { setNodeRef, isOver } = useDroppable({
    id: row?.path ?? instanceId,
    data: payload,
    disabled: !anchorable,
  });

  const sourcePayload = active?.data.current as DragPayload | undefined;
  const canDrop =
    isOver &&
    payload !== undefined &&
    sourcePayload !== undefined &&
    sourcePayload.path !== row?.path &&
    isValidDrop(sourcePayload, payload);

  return { setNodeRef, isOver, canDrop };
}
