import {createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode} from 'react';
import type {PortableError} from '@edgerules/portable';
import {AltHeldContext, useAltHeldState} from '../hooks/useAltHeld';

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
    /** Mutation failures that cannot live inside an editing cell (menus and append placeholders). */
    rowErrors: ReadonlyMap<string, PortableError>;
    setRowError: (path: string, error: PortableError | undefined) => void;
    /** Current whole-model link failure after a structural mutation. */
    modelError: PortableError | undefined;
    setModelError: (error: PortableError | undefined) => void;
}

const BoxedEditorUiContext = createContext<BoxedEditorUiValue | null>(null);

export interface BoxedEditorUiProviderProps {
    children: ReactNode;
    /** Initial global expand state only — each row keeps its own state after first toggle. */
    defaultExpanded?: boolean;
}

/** Ephemeral, per-mount UI state: ejected on unmount, never persisted (unlike the row tree). */
export function BoxedEditorUiProvider({children, defaultExpanded = true}: BoxedEditorUiProviderProps): ReactElement {
    const altHeld = useAltHeldState();
    const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
    const [activeCellPath, setActiveCellPath] = useState<string | null>(null);
    const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
    const [rowErrors, setRowErrors] = useState<Map<string, PortableError>>(() => new Map());
    const [modelError, setModelError] = useState<PortableError | undefined>();

    const isExpanded = useCallback(
        (path: string) => overrides.get(path) ?? defaultExpanded,
        [overrides, defaultExpanded],
    );
    const toggleExpand = useCallback(
        (path: string) => {
            setOverrides((previous) => {
                const next = new Map(previous);
                next.set(path, !(previous.get(path) ?? defaultExpanded));
                return next;
            });
        },
        [defaultExpanded],
    );

    const openModelSettings = useCallback(() => setModelSettingsOpen(true), []);
    const closeModelSettings = useCallback(() => setModelSettingsOpen(false), []);
    const setRowError = useCallback((path: string, error: PortableError | undefined) => {
        setRowErrors((previous) => {
            const next = new Map(previous);
            if (error) next.set(path, error);
            else next.delete(path);
            return next;
        });
    }, []);

    const value = useMemo<BoxedEditorUiValue>(
        () => ({
            isExpanded,
            toggleExpand,
            activeCellPath,
            setActiveCellPath,
            modelSettingsOpen,
            openModelSettings,
            closeModelSettings,
            rowErrors,
            setRowError,
            modelError,
            setModelError,
        }),
        [
            isExpanded,
            toggleExpand,
            activeCellPath,
            modelSettingsOpen,
            openModelSettings,
            closeModelSettings,
            rowErrors,
            setRowError,
            modelError,
        ],
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

/** Command-hook tests and non-visual hosts may provide only the data context. */
export function useOptionalBoxedEditorUi(): BoxedEditorUiValue | null {
    return useContext(BoxedEditorUiContext);
}
