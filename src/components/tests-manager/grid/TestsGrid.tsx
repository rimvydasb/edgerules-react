import {Alert, Tooltip} from '@mantine/core';
import {
    IconAlertTriangle,
    IconChevronLeft,
    IconChevronRight,
    IconFlask,
    IconLoader2,
    IconPlayerPlay,
    IconPlus,
} from '@tabler/icons-react';
import {closestCenter, DndContext} from '@dnd-kit/core';
import {horizontalListSortingStrategy, SortableContext, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {useSyncExternalStore, type CSSProperties, type ReactElement} from 'react';
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
import {KIND_COLORS} from '#ui/kindColors';
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
    // The trailing column holds `+`; once columns page, it widens by one step so the pager fits
    // under it.
    const paged = pageCount > 1;
    const trailingWidth = paged ? 2 * ICON_CELL_WIDTH : ICON_CELL_WIDTH;
    const trailingCell: CSSProperties = {width: trailingWidth, maxWidth: trailingWidth, padding: 0};

    const running = useSyncExternalStore(runner.subscribe, runner.getRunning);
    const anyRunning = running.length > 0;

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
            <div className={classes.container}>
                <GridTable className={classes.table}>
                    <GridHead>
                        <GridRow style={{height: headerRowHeight}}>
                            <GridCell
                                header
                                className={cx(classes.head, classes.logo)}
                                style={{...iconCell, left: 0, zIndex: 4, backgroundColor: KIND_COLORS.test}}
                            >
                                <IconFlask size={20} />
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
                            {/* Above the rows' three-dots column: the grid's one primary command. */}
                            <GridCell
                                header
                                fill
                                className={classes.head}
                                style={{...iconCell, left: ICON_CELL_WIDTH + pathColumnWidth, zIndex: 4}}
                            >
                                <Tooltip label="Run all test cases" withinPortal>
                                    <button
                                        type="button"
                                        aria-label="Run all"
                                        aria-busy={anyRunning || undefined}
                                        className={cx(classes.iconButton, classes.runAll)}
                                        onClick={() => void runner.runAll()}
                                    >
                                        {anyRunning ? (
                                            <IconLoader2 size={20} className={classes.spin} />
                                        ) : (
                                            <IconPlayerPlay size={20} />
                                        )}
                                    </button>
                                </Tooltip>
                            </GridCell>
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
                            <GridCell header fill className={classes.head} style={trailingCell}>
                                <span className={classes.cornerStack}>
                                    {!readOnly && (
                                        <span className={classes.cornerStep}>
                                            <Tooltip label="Add test case" withinPortal>
                                                <button
                                                    type="button"
                                                    aria-label="Add test case"
                                                    className={classes.iconButton}
                                                    onClick={() => testCasesService.addTestCase()}
                                                >
                                                    <IconPlus size={20} />
                                                </button>
                                            </Tooltip>
                                        </span>
                                    )}
                                    {paged && (
                                        <span className={classes.cornerStep}>
                                            <span className={classes.pager}>
                                                <button
                                                    type="button"
                                                    aria-label="previous page"
                                                    className={classes.iconButton}
                                                    onClick={prevPage}
                                                    disabled={pageIndex === 0}
                                                >
                                                    <IconChevronLeft size={14} />
                                                </button>
                                                <span
                                                    data-testid="page-indicator"
                                                    aria-label={`Page ${pageIndex + 1}/${pageCount}`}
                                                >
                                                    {pageIndex + 1}/{pageCount}
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label="next page"
                                                    className={classes.iconButton}
                                                    onClick={nextPage}
                                                    disabled={pageIndex >= pageCount - 1}
                                                >
                                                    <IconChevronRight size={14} />
                                                </button>
                                            </span>
                                        </span>
                                    )}
                                </span>
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
