import { useMemo } from 'react';
import type { PortableError } from '@edgerules/portable';
import { isPortableError } from '../../../lib/portable';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import type { BoxedRowData } from '../boxed-editor-types';

export interface RowCommands {
  /**
   * Commits a whole row (including its `children`) at `path`. Every value/name/cell/column/
   * parameter/setting edit and every `Add…` / `Convert to…` action goes through this one call
   * (Phases 3-6 add the callers; this phase wires the value-cell commit).
   */
  setBoxedRowData(path: string, row: BoxedRowData): PortableError | undefined;
  /** Name-cell commit on a named kind. */
  rename(path: string, newName: string): PortableError | undefined;
  /** `Delete`, cleared-name special actions, `Delete "‹column›" Column`. */
  remove(path: string): PortableError | undefined;
}

/**
 * The single dispatch point for every mutating action in the editor: commits through the
 * `BoxedEditorService` facade, returns a `PortableError` unchanged on rejection (so the calling
 * cell can keep focus and show it inline, per `docs/boxed-editor/phase-02-*`), and fires
 * `onChange` exactly once per successful commit — never on a rejected edit.
 */
export function useRowCommands(): RowCommands {
  const { service, onChange } = useBoxedEditorContext();

  return useMemo<RowCommands>(() => {
    const notifyChange = (): void => onChange?.(service.toPortable());

    return {
      setBoxedRowData(path, row) {
        const result = service.setBoxedRowData(path, row);
        if (isPortableError(result)) return result;
        notifyChange();
        return undefined;
      },
      rename(path, newName) {
        const result = service.rename(path, newName);
        if (isPortableError(result)) return result;
        notifyChange();
        return undefined;
      },
      remove(path) {
        const result = service.remove(path);
        if (isPortableError(result)) return result;
        notifyChange();
        return undefined;
      },
    };
  }, [service, onChange]);
}
