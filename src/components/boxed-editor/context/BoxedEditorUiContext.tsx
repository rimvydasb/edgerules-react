import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { AltHeldContext, useAltHeldState } from '../hooks/useAltHeld';

export interface BoxedEditorUiValue {
  /** Per-row expand/collapse, keyed by CRUD path. Falls back to the provider's default. */
  isExpanded: (path: string) => boolean;
  toggleExpand: (path: string) => void;
  /** The one active editing cell path — set by `ExpressionCell`/`NameCell`. A name cell keys its
   * slot as `${path}#name` so it never collides with that same row's value cell. */
  activeCellPath: string | null;
  setActiveCellPath: (path: string | null) => void;
  /** The model-level `Model Settings` dialog — opened from the `model` row's menu. */
  modelSettingsOpen: boolean;
  openModelSettings: () => void;
  closeModelSettings: () => void;
}

const BoxedEditorUiContext = createContext<BoxedEditorUiValue | null>(null);

export interface BoxedEditorUiProviderProps {
  children: ReactNode;
  /** Initial global expand state only — each row keeps its own state after first toggle. */
  defaultExpanded?: boolean;
}

/** Ephemeral, per-mount UI state: ejected on unmount, never persisted (unlike the row tree). */
export function BoxedEditorUiProvider({
  children,
  defaultExpanded = true,
}: BoxedEditorUiProviderProps): ReactElement {
  const altHeld = useAltHeldState();
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [activeCellPath, setActiveCellPath] = useState<string | null>(null);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);

  const isExpanded = useCallback(
    (path: string) => overrides.get(path) ?? defaultExpanded,
    [overrides, defaultExpanded],
  );
  const toggleExpand = useCallback((path: string) => {
    setOverrides((previous) => {
      const next = new Map(previous);
      next.set(path, !(previous.get(path) ?? defaultExpanded));
      return next;
    });
  }, [defaultExpanded]);

  const openModelSettings = useCallback(() => setModelSettingsOpen(true), []);
  const closeModelSettings = useCallback(() => setModelSettingsOpen(false), []);

  const value = useMemo<BoxedEditorUiValue>(
    () => ({
      isExpanded,
      toggleExpand,
      activeCellPath,
      setActiveCellPath,
      modelSettingsOpen,
      openModelSettings,
      closeModelSettings,
    }),
    [isExpanded, toggleExpand, activeCellPath, modelSettingsOpen, openModelSettings, closeModelSettings],
  );

  return (
    <AltHeldContext.Provider value={altHeld}>
      <BoxedEditorUiContext.Provider value={value}>{children}</BoxedEditorUiContext.Provider>
    </AltHeldContext.Provider>
  );
}

export function useBoxedEditorUi(): BoxedEditorUiValue {
  const context = useContext(BoxedEditorUiContext);
  if (!context) {
    throw new Error('useBoxedEditorUi must be used within a BoxedEditor');
  }
  return context;
}
