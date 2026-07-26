import { useCallback } from 'react';
import { PointerSensor, useSensor, useSensors, type DragEndEvent, type SensorDescriptor } from '@dnd-kit/core';
import type { TestRow } from '../../test-cases-service';

export interface UseRowDragResult {
  sensors: SensorDescriptor<object>[];
  handleDragEnd: (event: DragEndEvent) => void;
  itemIds: string[];
}

// Drag-and-drop reordering for one section's rows. Each row calls its own `useSortable({id:
// row.path})` (in `TestRowLine`); this hook only wires the section-level `DndContext` — sensors and
// the `onDragEnd` handler that turns a drop into a `TestCasesService.moveRow` call. Scoping one
// `DndContext`/`SortableContext` pair per section is what keeps a drag from crossing section
// boundaries: a row can never be dropped among another section's `useSortable` ids.
export function useRowDrag(rows: TestRow[], onMove: (path: string, toIndex: number) => void): UseRowDragResult {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const toIndex = rows.findIndex((row) => row.path === over.id);
      if (toIndex === -1) return;
      onMove(String(active.id), toIndex);
    },
    [rows, onMove],
  );

  return { sensors, handleDragEnd, itemIds: rows.map((row) => row.path) };
}
