import { useId } from 'react';
import {
  useDraggable,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import type { BoxedEditorService, BoxedRowData, BoxedTableRowData } from '../boxed-editor-types';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import { containerPathFor, inferLiteralKind, isMovableKind, type DragPayload } from './dropRules';

export interface RowDragHandle {
  setNodeRef: (element: HTMLElement | null) => void;
  listeners: DraggableSyntheticListeners;
  attributes: DraggableAttributes;
  isDragging: boolean;
  /** `false` for a non-sortable kind, or under `readOnly` — the handle stays visible either way
   * (Resolved Decision #4); this only says whether it currently responds to a pointer. */
  draggable: boolean;
}

function buildDragPayload(service: BoxedEditorService, row: BoxedRowData): DragPayload {
  const containerPath = containerPathFor(row);
  const containerKind = service.getBoxedRowData(containerPath)?.kind ?? 'model';
  const table = row as BoxedTableRowData;
  return {
    path: row.path,
    kind: row.kind,
    containerPath,
    containerKind,
    columns: row.kind === 'relation-item' ? table.columns : undefined,
    literalKind: row.kind === 'list-item' ? inferLiteralKind(row.value) : undefined,
  };
}

/**
 * Drag-source wiring for one row's handle — the function/ruleset/optimisation/type icon or the
 * 6-dot expression handle (`docs/boxed-editor/phase-06-drag-and-drop.md` §3). `row` is optional so
 * every `GenericRow` call site can wire this unconditionally (`NewRow`'s synthetic placeholder and
 * the fixed `model` row simply produce a non-draggable handle) without breaking the rules of hooks.
 */
export function useRowDrag(row: BoxedRowData | undefined): RowDragHandle {
  const instanceId = useId();
  const { service, readOnly } = useBoxedEditorContext();
  const movable = row !== undefined && isMovableKind(row.kind);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row?.path ?? instanceId,
    data: movable ? buildDragPayload(service, row) : undefined,
    disabled: !movable || readOnly,
  });
  return { setNodeRef, listeners, attributes, isDragging, draggable: movable && !readOnly };
}
