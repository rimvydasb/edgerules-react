import {createContext, useContext, useMemo, useState, type ReactElement, type ReactNode} from 'react';

export interface ActiveCell {
    testCaseId: string;
    path: string;
    kind: 'input' | 'assertion';
}

export interface TestsManagerUiContextValue {
    pageIndex: number;
    setPageIndex: (index: number) => void;
    activeCell: ActiveCell | undefined;
    setActiveCell: (cell: ActiveCell | undefined) => void;
}

const TestsManagerUiContext = createContext<TestsManagerUiContextValue | undefined>(undefined);

// Ephemeral, per-mount UI state that nothing needs to persist: which column page is showing and
// which cell is being edited. Kept apart from `TestsManagerContext` so a re-render triggered by
// typing into a cell never has to flow through the (persistence-backed) service context.
export function TestsManagerUiProvider({children}: {children: ReactNode}): ReactElement {
    const [pageIndex, setPageIndex] = useState(0);
    const [activeCell, setActiveCell] = useState<ActiveCell | undefined>(undefined);
    const value = useMemo(() => ({pageIndex, setPageIndex, activeCell, setActiveCell}), [pageIndex, activeCell]);
    return <TestsManagerUiContext.Provider value={value}>{children}</TestsManagerUiContext.Provider>;
}

export function useTestsManagerUiContext(): TestsManagerUiContextValue {
    const context = useContext(TestsManagerUiContext);
    if (!context) {
        throw new Error('useTestsManagerUiContext must be used within a TestsManagerUiProvider');
    }
    return context;
}
