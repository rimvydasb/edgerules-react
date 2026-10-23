import {Alert, Button, ActionIcon} from '@mantine/core';
import {IconAlertTriangle, IconChecklist, IconPlus} from '@tabler/icons-react';
import {closestCenter, DndContext} from '@dnd-kit/core';
import {horizontalListSortingStrategy, SortableContext, verticalListSortingStrategy} from '@dnd-kit/sortable';
import type {CSSProperties, ReactElement} from 'react';
import type {TestCase, TestRow} from '../../test-cases-service';
import {useTestsManagerContext} from '../context/TestsManagerContext';
import {useColumnDrag} from '../dnd/useColumnDrag';
import {useRowDrag} from '../dnd/useRowDrag';
import {useTestCaseColumns} from '../hooks/useTestCaseColumns';
import {useTestRows} from '../hooks/useTestRows';
import {useKnownPaths} from '../hooks/useKnownPaths';
import {useTestSubjects} from '../hooks/useTestSubjects';
import type {TestSubjectId} from '../tests-manager-types';
import {GridBody, GridCell, GridHead, GridRow, GridTable} from '#ui/grid';
import {cx} from '#ui/cx';
import * as classes from './testsGrid.module.css';
import {computePathColumnWidth} from './PathCell';
import {SectionHeaderRow} from './SectionHeaderRow';
import {SubjectHeaderCell} from './SubjectHeaderCell';
import {TestCaseHeaderCell} from './TestCaseHeaderCell';
import {TestRowLine} from './TestRowLine';
import {DESCRIPTION_COLUMN_WIDTH, ICON_CELL_WIDTH, rowHeightForText, TEST_CASE_COLUMN_WIDTH} from './wrapping';

function RowDragSection({
    rows,
    visibleCases,
    pathColumnWidth,
    knownPaths,
    onMove,
}: {
    rows: TestRow[];
    visibleCases: TestCase[];
    pathColumnWidth: number;
    knownPaths: ReadonlySet<string>;
    onMove: (path: string, toIndex: number) => void;
}): ReactElement {
    const {sensors, handleDragEnd, itemIds} = useRowDrag(rows, onMove);
    return (
        // `accessibility.container` portals DndContext's hidden instructions/live-region <div>s out
        // of the table — left to render in place, they'd land inside <tbody>, which is invalid HTML
        // (and a React hydration-mismatch warning) once a drag actually activates them.
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{container: document.body}}
        >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                {rows.map((row) => (
                    <TestRowLine
                        key={row.path}
                        row={row}
                        visibleCases={visibleCases}
                        pathColumnWidth={pathColumnWidth}
                        knownPaths={knownPaths}
                    />
                ))}
            </SortableContext>
        </DndContext>
    );
}

// Grid shell: frozen Path/Description columns, column paging, and the three fixed sections.
export function TestsGrid({onSubjectChange}: {onSubjectChange: (id: TestSubjectId) => void}): ReactElement {
    const {service, testCasesService, runner, subject, readOnly, revision, pageSize} = useTestsManagerContext();
    const subjects = useTestSubjects(service, revision);

    // Rows the model no longer declares stay visible (present: false) — TestRowLine flags them
    // with a warning instead of hiding them, since their data is kept, not discarded.
    const rows = useTestRows(testCasesService);
    // Recomputed here rather than per row: every Path cell validates against the same universe.
    const knownPaths = useKnownPaths(service, subject, revision, rows);
    const inputRows = rows.filter((row) => row.section === 'inputs');
    const assertionRows = rows.filter((row) => row.section === 'assertions');
    const validationRows = rows.filter((row) => row.section === 'validations');
    const {allCases, visibleCases, pageIndex, pageCount, nextPage, prevPage} = useTestCaseColumns(
        testCasesService,
        pageSize,
    );

    const pathColumnWidth = computePathColumnWidth(rows.map((row) => row.path));
    // Two `ROW_HEIGHT_STEP`s (80px) fixed — the name area sits between the two 40px
    // drag-handle/menu icons (see `TestCaseHeaderCell`), so a long name that needs more than that
    // still wraps against that narrower width and grows the row further.
    const headerRowHeight = Math.max(
        80,
        ...visibleCases.map((testCase) =>
            rowHeightForText(testCase.name, TEST_CASE_COLUMN_WIDTH - 2 * ICON_CELL_WIDTH),
        ),
    );

    const needsSolver = service.requiresSolver() && service.solverHandler === undefined;
    const moveRow = (path: string, toIndex: number): void => testCasesService.moveRow(path, toIndex);
    const moveTestCase = (testCaseId: string, toIndex: number): void =>
        testCasesService.moveTestCase(testCaseId, toIndex);
    const {
        sensors: columnSensors,
        handleDragEnd: handleColumnDragEnd,
        itemIds: columnItemIds,
    } = useColumnDrag(allCases, visibleCases, moveTestCase);

    const iconCell: CSSProperties = {width: ICON_CELL_WIDTH, maxWidth: ICON_CELL_WIDTH, padding: 0};

    return (
        <div data-testid="tests-grid" className={classes.root}>
            {needsSolver && (
                <Alert
                    color="yellow"
                    variant="light"
                    data-testid="missing-solver-banner"
                    mb="xs"
                    icon={<IconAlertTriangle size={16} />}
                >
                    No optimisation solver registered for this model.
                </Alert>
            )}
            <div className={classes.toolbar}>
                {!readOnly && (
                    <Button size="compact-sm" variant="subtle" onClick={() => testCasesService.addTestCase()}>
                        Add test case
                    </Button>
                )}
                <Button size="compact-sm" variant="subtle" onClick={() => void runner.runAll()}>
                    Run all
                </Button>
                {pageCount > 1 && (
                    <div className={classes.pager}>
                        <Button
                            size="compact-sm"
                            variant="subtle"
                            onClick={prevPage}
                            disabled={pageIndex === 0}
                            aria-label="previous page"
                        >
                            ‹
                        </Button>
                        <span data-testid="page-indicator">
                            Page {pageIndex + 1}/{pageCount}
                        </span>
                        <Button
                            size="compact-sm"
                            variant="subtle"
                            onClick={nextPage}
                            disabled={pageIndex >= pageCount - 1}
                            aria-label="next page"
                        >
                            ›
                        </Button>
                    </div>
                )}
            </div>
            <div className={classes.container}>
                <GridTable className={classes.table}>
                    <GridHead>
                        <GridRow style={{height: headerRowHeight}}>
                            <GridCell
                                header
                                className={cx(classes.head, classes.logo)}
                                style={{...iconCell, left: 0, zIndex: 4}}
                            >
                                <IconChecklist size={16} />
                            </GridCell>
                            <GridCell
                                header
                                className={classes.head}
                                style={{left: ICON_CELL_WIDTH, zIndex: 4, width: pathColumnWidth}}
                            >
                                <SubjectHeaderCell
                                    subjects={subjects}
                                    value={subject.id}
                                    onChange={onSubjectChange}
                                    readOnly={readOnly}
                                />
                            </GridCell>
                            <GridCell
                                header
                                className={classes.head}
                                style={{...iconCell, left: ICON_CELL_WIDTH + pathColumnWidth, zIndex: 4}}
                            />
                            <GridCell
                                header
                                className={classes.head}
                                style={{
                                    left: ICON_CELL_WIDTH + pathColumnWidth + ICON_CELL_WIDTH,
                                    zIndex: 4,
                                    width: DESCRIPTION_COLUMN_WIDTH,
                                    maxWidth: DESCRIPTION_COLUMN_WIDTH,
                                }}
                            >
                                Description
                            </GridCell>
                            {/* See the row-level `DndContext` above for why `accessibility.container` is set. */}
                            <DndContext
                                sensors={columnSensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleColumnDragEnd}
                                accessibility={{container: document.body}}
                            >
                                <SortableContext items={columnItemIds} strategy={horizontalListSortingStrategy}>
                                    {visibleCases.map((testCase) => (
                                        <GridCell
                                            header
                                            fill
                                            key={testCase.id}
                                            className={classes.head}
                                            style={{width: TEST_CASE_COLUMN_WIDTH, maxWidth: TEST_CASE_COLUMN_WIDTH}}
                                        >
                                            <TestCaseHeaderCell testCase={testCase} />
                                        </GridCell>
                                    ))}
                                </SortableContext>
                            </DndContext>
                            <GridCell header align="center" className={classes.head} style={iconCell}>
                                {!readOnly && (
                                    <ActionIcon
                                        size="sm"
                                        variant="subtle"
                                        color="gray"
                                        aria-label="Add test case at end"
                                        onClick={() => testCasesService.addTestCase()}
                                    >
                                        <IconPlus size={16} />
                                    </ActionIcon>
                                )}
                            </GridCell>
                        </GridRow>
                    </GridHead>
                    <GridBody>
                        <SectionHeaderRow
                            sectionId="inputs"
                            rows={inputRows}
                            testCasesService={testCasesService}
                            visibleCases={visibleCases}
                            revision={revision}
                        />
                        <RowDragSection
                            rows={inputRows}
                            visibleCases={visibleCases}
                            pathColumnWidth={pathColumnWidth}
                            knownPaths={knownPaths}
                            onMove={moveRow}
                        />
                        <SectionHeaderRow
                            sectionId="assertions"
                            rows={assertionRows}
                            testCasesService={testCasesService}
                            visibleCases={visibleCases}
                            revision={revision}
                        />
                        <RowDragSection
                            rows={assertionRows}
                            visibleCases={visibleCases}
                            pathColumnWidth={pathColumnWidth}
                            knownPaths={knownPaths}
                            onMove={moveRow}
                        />
                        <SectionHeaderRow
                            sectionId="validations"
                            rows={validationRows}
                            testCasesService={testCasesService}
                            visibleCases={visibleCases}
                            revision={revision}
                        />
                        <RowDragSection
                            rows={validationRows}
                            visibleCases={visibleCases}
                            pathColumnWidth={pathColumnWidth}
                            knownPaths={knownPaths}
                            onMove={moveRow}
                        />
                    </GridBody>
                </GridTable>
            </div>
        </div>
    );
}
