import {Alert} from '@mantine/core';
import {DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent} from '@dnd-kit/core';
import {useEffect, useRef, useState, type ReactElement, type RefObject} from 'react';
import type {BoxedEditorProps} from './BoxedEditorProps';
import {useRowCommands} from './commands/useRowCommands';
import {BoxedEditorProvider} from './context/BoxedEditorContext';
import {BoxedEditorTestProvider} from './context/BoxedEditorTestContext';
import {BoxedEditorUiProvider} from './context/BoxedEditorUiContext';
import {BoxedLayoutProvider} from './context/BoxedLayoutContext';
import {useBoxedEditorUi} from './context/BoxedEditorUiContext';
import {isValidDrop, type DragPayload, type DropTargetPayload} from './dnd/dropRules';
import * as classes from './boxedEditor.module.css';
import {cx} from '#ui/cx';
import {useBoxedEditorService} from './hooks/useBoxedEditorService';
import {useBoxedRows} from './hooks/useBoxedRows';
import {HeaderRow} from './rows/HeaderRow';
import {NewRow} from './rows/NewRow';
import {RowSwitch} from './rows/RowSwitch';

// Root kinds that keep their own row; the row renders its children and its trailing new-item row itself. An opened
// context keeps its name row (with its menu), and an opened field has no children. An opened function keeps its
// header row, so its arguments stay editable. A ruleset and an optimisation lay out the columns of their child rows in
// their own header row, so their children cannot render without it; so does a relation, and a list keeps its name row
// like a context.
const OWN_ROW_ROOT_KINDS = new Set(['context', 'field', 'list', 'relation', 'function', 'ruleset', 'optimisation']);

interface BoxedEditorGridProps {
    path: string;
    showHeader: boolean;
}

/** The width of `ref`'s parent element, followed on every resize. */
function useParentWidth(ref: RefObject<HTMLElement | null>): number | undefined {
    const [width, setWidth] = useState<number>();
    useEffect(() => {
        const parent = ref.current?.parentElement;
        if (!parent || typeof ResizeObserver === 'undefined') return undefined;
        const measure = (): void => setWidth(parent.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(parent);
        return () => observer.disconnect();
    }, [ref]);
    return width;
}

function BoxedEditorGrid({path, showHeader}: BoxedEditorGridProps): ReactElement {
    const gridRef = useRef<HTMLDivElement>(null);
    // The value column always widens to fill the width of the editor.
    const availableWidth = useParentWidth(gridRef);
    const service = useBoxedEditorService();
    const rows = useBoxedRows(path);
    const rootRow = service.getBoxedRowData(path);
    const commands = useRowCommands();
    const {modelError} = useBoxedEditorUi();
    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 6}}));

    if (rootRow === undefined) {
        return (
            <Alert color="red" variant="light">
                Cannot load &quot;{path}&quot; — the path does not exist in this model.
            </Alert>
        );
    }

    // The single pure predicate (`dropRules.isValidDrop`) gates the drop the same way it gates each
    // row's own live preview (`useRowDrop`) — the two can never disagree. An invalid or missing
    // target is simply a no-op: the dragged row's own CSS transform reverts and nothing is called.
    const handleDragEnd = (event: DragEndEvent): void => {
        const source = event.active.data.current as DragPayload | undefined;
        const target = event.over?.data.current as DropTargetPayload | undefined;
        if (!source || !target) return;
        if (!isValidDrop(source, target)) return;
        commands.move(source.path, target.containerPath, target.index);
    };

    return (
        <>
            {modelError && (
                <Alert color="red" variant="light" role="alert" data-testid="model-error" mb="xs">
                    {modelError.path ? `${modelError.path}: ` : ''}
                    {modelError.message}
                </Alert>
            )}
            <div ref={gridRef} role="treegrid" className={classes.grid}>
                <BoxedLayoutProvider rows={rows} availableWidth={availableWidth} baseDepth={rootRow.depth}>
                    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                        {showHeader && <HeaderRow row={rootRow} />}
                        {OWN_ROW_ROOT_KINDS.has(rootRow.kind) ? (
                            <RowSwitch row={{...rootRow, children: rows}} />
                        ) : (
                            <>
                                {rows.map((row) => (
                                    <RowSwitch key={row.path} row={row} />
                                ))}
                                <NewRow row={{...rootRow, children: rows}} />
                            </>
                        )}
                    </DndContext>
                </BoxedLayoutProvider>
            </div>
        </>
    );
}

/** Local state that follows `value` whenever the prop itself changes (React's "adjust state on prop change"). */
function useSyncedState(value: boolean): [boolean, (next: boolean) => void] {
    const [state, setState] = useState(value);
    const [previous, setPrevious] = useState(value);
    if (previous !== value) {
        setPrevious(value);
        setState(value);
    }
    return [state, setState];
}

/**
 * The structured, visual authoring surface for EdgeRules models: a single flat treegrid of rows.
 * Renders no rule-evaluation logic of its own — the `BoxedEditorService` facade over
 * `MutableDecisionService` is the single source of truth; this component derives and displays
 * its row tree, never storing a copy in React state.
 */
export function BoxedEditor(props: BoxedEditorProps): ReactElement {
    const {
        service,
        path,
        revision,
        readOnly = false,
        onChange,
        onOpenNode,
        languageService,
        documentationService,
        testCasesService,
        testRunner,
        testSubjectId,
        autoRunTests = true,
        showHeader = true,
        showTestResults: defaultShowTestResults = false,
        showDescription: defaultShowDescription = true,
        onShowDescriptionChange,
        onShowTestResultsChange,
        showType = true,
        expanded = true,
        onExpand,
        className,
        style,
    } = props;
    // The header toggles change the column visibility; a changed prop sets it again.
    const [showDescription, setOwnShowDescription] = useSyncedState(defaultShowDescription);
    const [showTestResults, setOwnShowTestResults] = useSyncedState(defaultShowTestResults);
    const setShowDescription = (show: boolean): void => {
        setOwnShowDescription(show);
        onShowDescriptionChange?.(show);
    };
    const setShowTestResults = (show: boolean): void => {
        setOwnShowTestResults(show);
        onShowTestResultsChange?.(show);
    };

    return (
        <div className={cx(classes.root, className)} style={style}>
            <BoxedEditorProvider
                service={service}
                readOnly={readOnly}
                onChange={onChange}
                onOpenNode={onOpenNode}
                showDescription={showDescription}
                showTestResults={showTestResults}
                showType={showType}
                onExpand={onExpand}
                setShowDescription={setShowDescription}
                setShowTestResults={setShowTestResults}
                languageService={languageService}
                documentationService={documentationService}
                testCasesService={testCasesService}
                testRunner={testRunner}
                testSubjectId={testSubjectId}
                autoRunTests={autoRunTests}
                revision={revision}
            >
                <BoxedEditorTestProvider>
                    <BoxedEditorUiProvider defaultExpanded={expanded}>
                        <BoxedEditorGrid path={path} showHeader={showHeader} />
                    </BoxedEditorUiProvider>
                </BoxedEditorTestProvider>
            </BoxedEditorProvider>
        </div>
    );
}
