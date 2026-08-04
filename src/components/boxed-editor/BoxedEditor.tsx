import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import {DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent} from '@dnd-kit/core';
import type {ReactElement} from 'react';
import type {BoxedEditorProps} from './BoxedEditorProps';
import {useRowCommands} from './commands/useRowCommands';
import {BoxedEditorProvider} from './context/BoxedEditorContext';
import {BoxedEditorTestProvider} from './context/BoxedEditorTestContext';
import {BoxedEditorUiProvider} from './context/BoxedEditorUiContext';
import {useBoxedEditorUi} from './context/BoxedEditorUiContext';
import {isValidDrop, type DragPayload, type DropTargetPayload} from './dnd/dropRules';
import {useBoxedEditorService} from './hooks/useBoxedEditorService';
import {useBoxedRows} from './hooks/useBoxedRows';
import {ModelHeaderRow} from './rows/ModelHeaderRow';
import {NewRow} from './rows/NewRow';
import {RowSwitch} from './rows/RowSwitch';

interface BoxedEditorGridProps {
    path: string;
    showHeader: boolean;
}

function BoxedEditorGrid({path, showHeader}: BoxedEditorGridProps): ReactElement {
    const service = useBoxedEditorService();
    const rows = useBoxedRows(path);
    const rootRow = service.getBoxedRowData(path);
    const commands = useRowCommands();
    const {modelError} = useBoxedEditorUi();
    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 6}}));

    if (rootRow === undefined) {
        return <Alert severity="error">Cannot load &quot;{path}&quot; — the path does not exist in this model.</Alert>;
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
                <Alert severity="error" role="alert" data-testid="model-error" sx={{mb: 1}}>
                    {modelError.path ? `${modelError.path}: ` : ''}
                    {modelError.message}
                </Alert>
            )}
            <Box
                role="treegrid"
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: 'fit-content',
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    bgcolor: 'background.paper',
                }}
            >
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    {showHeader && rootRow.kind === 'model' && <ModelHeaderRow row={rootRow} />}
                    {rows.map((row) => (
                        <RowSwitch key={row.path} row={row} />
                    ))}
                    <NewRow row={{...rootRow, children: rows}} />
                </DndContext>
            </Box>
        </>
    );
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
        showTestResults = true,
        showDescription = true,
        showType = true,
        expanded = true,
        className,
        sx,
    } = props;

    return (
        <Box className={className} sx={sx}>
            <BoxedEditorProvider
                service={service}
                readOnly={readOnly}
                onChange={onChange}
                onOpenNode={onOpenNode}
                showDescription={showDescription}
                showTestResults={showTestResults}
                showType={showType}
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
        </Box>
    );
}
