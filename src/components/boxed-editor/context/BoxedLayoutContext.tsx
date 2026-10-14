import {createContext, useContext, useMemo, type ReactElement, type ReactNode} from 'react';
import type {BoxedRowData} from '../boxed-editor-types';
import {gridTemplateColumns, valueColumnUnits, VALUE_COLUMN_UNITS} from '../primitives/layout';
import {useBoxedEditorContext} from './BoxedEditorContext';

export interface BoxedLayout {
    /** Shared `grid-template-columns` — every row of the tree uses exactly this string. */
    template: string;
    /** Value-column width in grid steps (see `primitives/layout.ts`). */
    valueUnits: number;
    showDescription: boolean;
    /** Hidden entirely (not just emptied) when no `testCasesService` is provided. */
    showTestResults: boolean;
}

function buildLayout(showDescription: boolean, showTestResults: boolean, valueUnits: number): BoxedLayout {
    return {
        template: gridTemplateColumns({showDescription, showTestResults, valueUnits}),
        valueUnits,
        showDescription,
        showTestResults,
    };
}

const BoxedLayoutContext = createContext<BoxedLayout | null>(null);

/** Computes the column layout once for the whole tree, so every row's borders land on the same steps. */
export function BoxedLayoutProvider({rows, children}: {rows: BoxedRowData[]; children: ReactNode}): ReactElement {
    const {showDescription, showTestResults, testCasesService} = useBoxedEditorContext();
    const showTestResultsColumn = showTestResults && testCasesService !== undefined;
    const valueUnits = useMemo(() => valueColumnUnits(rows), [rows]);
    const layout = useMemo(
        () => buildLayout(showDescription, showTestResultsColumn, valueUnits),
        [showDescription, showTestResultsColumn, valueUnits],
    );
    return <BoxedLayoutContext.Provider value={layout}>{children}</BoxedLayoutContext.Provider>;
}

/** The tree's column layout; rows rendered outside a `BoxedLayoutProvider` (unit tests) get the default. */
export function useBoxedLayout(): BoxedLayout {
    const layout = useContext(BoxedLayoutContext);
    const {showDescription, showTestResults, testCasesService} = useBoxedEditorContext();
    const showTestResultsColumn = showTestResults && testCasesService !== undefined;
    return useMemo(
        () => layout ?? buildLayout(showDescription, showTestResultsColumn, VALUE_COLUMN_UNITS),
        [layout, showDescription, showTestResultsColumn],
    );
}
