import { useCallback, useSyncExternalStore } from 'react';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';

export interface UseDescriptionResult {
  description: string;
  setDescription: (value: string) => void;
  readOnly: boolean;
}

const subscribeNever = (): (() => void) => () => {};

/**
 * Thin wrapper over `edgerules-react/documentation-service`'s `useDescription`, sourcing the
 * (optional) `documentationService` from `BoxedEditorContext`. Empty and read-only when the editor
 * was mounted without one (Section 4).
 */
export function useDescription(path: string): UseDescriptionResult {
  const { documentationService, readOnly } = useBoxedEditorContext();
  const getSnapshot = useCallback(
    () => documentationService?.getDescription(path) ?? '',
    [documentationService, path],
  );
  const description = useSyncExternalStore(documentationService?.subscribe ?? subscribeNever, getSnapshot);
  const setDescription = useCallback(
    (value: string) => documentationService?.setDescription(path, value),
    [documentationService, path],
  );
  return { description, setDescription, readOnly: readOnly || documentationService === undefined };
}
