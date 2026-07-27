import { useSyncExternalStore } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { useBoxedEditorService } from './useBoxedEditorService';

/**
 * The row tree under `path`, kept in sync with the facade's cache. `getBoxedRowsData` is
 * referentially stable while nothing under `path` changed, so this only re-renders on an actual
 * committed mutation or an `invalidate()` — safe as a `useSyncExternalStore` snapshot.
 */
export function useBoxedRows(path: string): BoxedRowData[] {
  const service = useBoxedEditorService();
  return useSyncExternalStore(service.subscribe, () => service.getBoxedRowsData(path));
}
