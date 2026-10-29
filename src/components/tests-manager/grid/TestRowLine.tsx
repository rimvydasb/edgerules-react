import {Tooltip} from '@mantine/core';
import {IconAlertTriangle, IconDotsVertical, IconGripVertical} from '@tabler/icons-react';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {type CSSProperties, type ReactElement, useSyncExternalStore} from 'react';
import {qualifyPath, type TestCase, type TestRow} from '../../test-cases-service';
import {cx} from '#ui/cx';
import {GridCell, GridRow} from '#ui/grid';
import {useTestsManagerContext} from '../context/TestsManagerContext';
import {rowActionsFor} from '../menu/actions';
import {TestsMenu} from '../menu/TestsMenu';
import {AssertionCell} from './AssertionCell';
import {InputCell} from './InputCell';
import {PathCell} from './PathCell';
import * as classes from './testsGrid.module.css';
import {ValidationCell} from './ValidationCell';
import {DESCRIPTION_COLUMN_WIDTH, ICON_CELL_WIDTH, rowHeightForText, TEST_CASE_COLUMN_WIDTH} from './wrapping';

const DELETED_ROW_TOOLTIP = 'Removed from the model — kept for reference, will not be used in future runs.';

export const ROW_HEIGHT = 40;

function noSubscription(): () => void {
    return () => {};
}

// One row: drag handle, path cell, description cell, its case cells. Row height grows in
// `ROW_HEIGHT_STEP` increments to fit a wrapped Description (see `wrapping.ts`) — every other cell
// in the row just gets the extra space.
export function TestRowLine({
    row,
    visibleCases,
    pathColumnWidth,
    knownPaths,
}: {
    row: TestRow;
    visibleCases: TestCase[];
    pathColumnWidth: number;
    knownPaths: ReadonlySet<string>;
}): ReactElement {
    const {testCasesService, documentationService, subject, readOnly} = useTestsManagerContext();
    const sortable = useSortable({id: row.path, disabled: readOnly});
    const deleted = !row.present;

    const qualifiedPath = qualifyPath(subject.id, row.path);
    // Subscribed (not a plain read) so the row's height — and a shared `DocumentationService`'s
    // cross-instance updates — reflect a description edited from anywhere, not just this row's own
    // textarea.
    const description = useSyncExternalStore(
        documentationService?.subscribe ?? noSubscription,
        () => documentationService?.getDescription(qualifiedPath) ?? '',
    );
    const rowHeight = rowHeightForText(description, DESCRIPTION_COLUMN_WIDTH);

    const style: CSSProperties = {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        height: rowHeight,
    };

    const menuActions = rowActionsFor(row, testCasesService);
    const hasMenuActions = menuActions.length > 0;
    const sticky = cx(classes.sticky, deleted && classes.deleted);
    const iconCell: CSSProperties = {width: ICON_CELL_WIDTH, maxWidth: ICON_CELL_WIDTH};

    return (
        <GridRow ref={sortable.setNodeRef} style={style} data-testid={`row-${row.path || '(result)'}`}>
            <GridCell fill className={cx(sticky, classes.muted)} style={{...iconCell, left: 0}}>
                {!readOnly && (
                    <span
                        aria-label={`drag ${row.path}`}
                        {...sortable.attributes}
                        {...sortable.listeners}
                        className={cx(classes.iconBox, classes.drag)}
                    >
                        <IconGripVertical size={19} />
                    </span>
                )}
            </GridCell>
            <GridCell className={sticky} style={{left: ICON_CELL_WIDTH, width: pathColumnWidth, whiteSpace: 'nowrap'}}>
                <PathCell row={row} columnWidth={pathColumnWidth} knownPaths={knownPaths} />
                {deleted && (
                    <Tooltip label={DELETED_ROW_TOOLTIP} withinPortal>
                        <IconAlertTriangle
                            aria-label={`deleted ${row.path}`}
                            size={16}
                            className={classes.deletedIcon}
                        />
                    </Tooltip>
                )}
            </GridCell>
            <GridCell
                fill
                className={cx(sticky, classes.muted)}
                style={{...iconCell, left: ICON_CELL_WIDTH + pathColumnWidth}}
            >
                {!readOnly && (
                    <span className={classes.iconBox}>
                        <TestsMenu actions={menuActions}>
                            <button
                                type="button"
                                aria-label={`row menu ${row.path}`}
                                disabled={!hasMenuActions}
                                className={classes.iconButton}
                            >
                                <IconDotsVertical size={20} />
                            </button>
                        </TestsMenu>
                    </span>
                )}
            </GridCell>
            <GridCell
                fill
                className={cx(sticky, classes.descriptionCell)}
                style={{
                    left: ICON_CELL_WIDTH + pathColumnWidth + ICON_CELL_WIDTH,
                    width: DESCRIPTION_COLUMN_WIDTH,
                    maxWidth: DESCRIPTION_COLUMN_WIDTH,
                }}
            >
                {documentationService ? (
                    <textarea
                        aria-label={`description ${row.path}`}
                        value={description}
                        disabled={readOnly}
                        placeholder={readOnly ? undefined : '…'}
                        className={classes.description}
                        onChange={(event) => documentationService.setDescription(qualifiedPath, event.target.value)}
                    />
                ) : null}
            </GridCell>
            {visibleCases.map((testCase) => (
                <GridCell
                    key={testCase.id}
                    fill
                    className={cx(deleted && classes.deleted)}
                    style={{width: TEST_CASE_COLUMN_WIDTH, maxWidth: TEST_CASE_COLUMN_WIDTH}}
                >
                    {row.section === 'inputs' && <InputCell testCaseId={testCase.id} row={row} />}
                    {row.section === 'assertions' && <AssertionCell testCaseId={testCase.id} row={row} />}
                    {row.section === 'validations' && <ValidationCell testCaseId={testCase.id} row={row} />}
                </GridCell>
            ))}
            <GridCell fill className={cx(deleted && classes.deleted)} />
        </GridRow>
    );
}
