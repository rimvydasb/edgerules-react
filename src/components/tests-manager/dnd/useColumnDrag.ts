import { useCallback } from 'react';
import { PointerSensor, useSensor, useSensors, type DragEndEvent, type SensorDescriptor } from '@dnd-kit/core';
import type { TestCase } from '../../test-cases-service';

export interface UseColumnDragResult {
  sensors: SensorDescriptor<object>[];
  handleDragEnd: (event: DragEndEvent) => void;
  itemIds: string[];
}

// Drag-and-drop reordering for test-case columns via each header's own drag handle (`useSortable({id:
// testCase.id})` in `TestCaseHeaderCell`). `toIndex` is resolved against `allCases` — the full,
// unpaged list `TestCasesService.moveTestCase` orders — rather than `visibleCases`, so a drop on a
// page never gets clamped to that page's own (much smaller) index range.
export function useColumnDrag(
  allCases: TestCase[],
  visibleCases: TestCase[],
  onMove: (testCaseId: string, toIndex: number) => void,
): UseColumnDragResult {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const toIndex = allCases.findIndex((testCase) => testCase.id === over.id);
      if (toIndex === -1) return;
      onMove(String(active.id), toIndex);
    },
    [allCases, onMove],
  );

  return { sensors, handleDragEnd, itemIds: visibleCases.map((testCase) => testCase.id) };
}
