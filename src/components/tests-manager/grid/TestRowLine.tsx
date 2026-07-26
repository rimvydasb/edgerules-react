import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {type CSSProperties, type ReactElement, useState, useSyncExternalStore,} from 'react';
import type {TestCase, TestRow} from '../../test-cases-service';
import {useTestsManagerContext} from '../context/TestsManagerContext';
import {qualifyPath} from '../model/inputs';
import {rowActionsFor} from '../menu/actions';
import {TestsMenu} from '../menu/TestsMenu';
import {AssertionCell} from './AssertionCell';
import {CELL_BORDER_SX, DELETED_ROW_BG} from './gridStyle';
import {InputCell} from './InputCell';
import {PathCell} from './PathCell';
import {ValidationCell} from './ValidationCell';
import {DESCRIPTION_COLUMN_WIDTH, ICON_CELL_WIDTH, rowHeightForText, TEST_CASE_COLUMN_WIDTH,} from './wrapping';

const DELETED_ROW_TOOLTIP =
    'Removed from the model — kept for reference, will not be used in future runs.';

export const ROW_HEIGHT = 40;

function noSubscription(): () => void {
    return () => {
    };
}

// One row: drag handle, path cell, description cell, its case cells. Row height grows in
// `ROW_HEIGHT_STEP` increments to fit a wrapped Description (see `wrapping.ts`) — every other cell
// in the row just gets the extra space.
export function TestRowLine({
                                row,
                                visibleCases,
                                pathColumnWidth,
                            }: {
    row: TestRow;
    visibleCases: TestCase[];
    pathColumnWidth: number;
}): ReactElement {
    const {testCasesService, documentationService, subject, readOnly} =
        useTestsManagerContext();
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
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

    return (
        <TableRow
            ref={sortable.setNodeRef}
            style={style}
            data-testid={`row-${row.path || '(result)'}`}
        >
            <TableCell
                sx={{
                    ...CELL_BORDER_SX,
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    backgroundColor: deleted ? DELETED_ROW_BG : 'background.paper',
                    width: ICON_CELL_WIDTH,
                    maxWidth: ICON_CELL_WIDTH,
                    padding: 0,
                }}
            >
                {!readOnly && (
                    <span
                        aria-label={`drag ${row.path}`}
                        {...sortable.attributes}
                        {...sortable.listeners}
                        style={{
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: ICON_CELL_WIDTH,
                            height: ICON_CELL_WIDTH,
                        }}
                    >
                        <DragIndicatorIcon fontSize="small"/>
                    </span>
                )}
            </TableCell>
            <TableCell
                sx={{
                    ...CELL_BORDER_SX,
                    position: 'sticky',
                    left: ICON_CELL_WIDTH,
                    zIndex: 1,
                    backgroundColor: deleted ? DELETED_ROW_BG : 'background.paper',
                    whiteSpace: 'nowrap',
                    width: pathColumnWidth,
                }}
            >
                <PathCell path={row.path} columnWidth={pathColumnWidth} type={row.type}/>
                {deleted && (
                    <Tooltip title={DELETED_ROW_TOOLTIP}>
                        <WarningAmberIcon
                            aria-label={`deleted ${row.path}`}
                            color="error"
                            fontSize="small"
                            sx={{verticalAlign: 'middle', marginLeft: 0.5}}
                        />
                    </Tooltip>
                )}
            </TableCell>
            <TableCell
                sx={{
                    ...CELL_BORDER_SX,
                    position: 'sticky',
                    left: ICON_CELL_WIDTH + pathColumnWidth,
                    zIndex: 1,
                    backgroundColor: deleted ? DELETED_ROW_BG : 'background.paper',
                    width: ICON_CELL_WIDTH,
                    maxWidth: ICON_CELL_WIDTH,
                    padding: 0,
                }}
            >
                {!readOnly && (
                    <span
                        style={{
                            width: ICON_CELL_WIDTH,
                            height: ICON_CELL_WIDTH,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <button
                            type="button"
                            aria-label={`row menu ${row.path}`}
                            disabled={!hasMenuActions}
                            onClick={(event) => setMenuAnchor(event.currentTarget)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: hasMenuActions ? 'pointer' : 'default',
                                opacity: hasMenuActions ? 1 : 0.3,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <MoreVertIcon fontSize="small"/>
                        </button>
                    </span>
                )}
                <TestsMenu
                    anchorEl={menuAnchor}
                    onClose={() => setMenuAnchor(null)}
                    actions={menuActions}
                />
            </TableCell>
            <TableCell
                sx={{
                    ...CELL_BORDER_SX,
                    position: 'sticky',
                    left: ICON_CELL_WIDTH + pathColumnWidth + ICON_CELL_WIDTH,
                    zIndex: 1,
                    backgroundColor: deleted ? DELETED_ROW_BG : 'background.paper',
                    width: DESCRIPTION_COLUMN_WIDTH,
                    maxWidth: DESCRIPTION_COLUMN_WIDTH,
                    padding: 0,
                }}
            >
                {documentationService ? (
                    <textarea
                        aria-label={`description ${row.path}`}
                        value={description}
                        disabled={readOnly}
                        onChange={(event) =>
                            documentationService.setDescription(
                                qualifiedPath,
                                event.target.value,
                            )
                        }
                        style={{
                            position: 'absolute',
                            inset: 0,
                            border: 'none',
                            outline: 'none',
                            resize: 'none',
                            boxSizing: 'border-box',
                            padding: '8px',
                            background: 'transparent',
                            font: 'inherit',
                        }}
                    />
                ) : null}
            </TableCell>
            {visibleCases.map((testCase) => (
                <TableCell
                    key={testCase.id}
                    sx={{
                        ...CELL_BORDER_SX,
                        position: 'relative',
                        width: TEST_CASE_COLUMN_WIDTH,
                        maxWidth: TEST_CASE_COLUMN_WIDTH,
                        padding: 0,
                        backgroundColor: deleted ? DELETED_ROW_BG : undefined,
                    }}
                >
                    {row.section === 'inputs' && (
                        <InputCell testCaseId={testCase.id} row={row}/>
                    )}
                    {row.section === 'assertions' && (
                        <AssertionCell testCaseId={testCase.id} row={row}/>
                    )}
                    {row.section === 'validations' && (
                        <ValidationCell testCaseId={testCase.id} row={row}/>
                    )}
                </TableCell>
            ))}
            <TableCell
                sx={{
                    ...CELL_BORDER_SX,
                    width: ICON_CELL_WIDTH,
                    maxWidth: ICON_CELL_WIDTH,
                    padding: 0,
                    backgroundColor: deleted ? DELETED_ROW_BG : undefined,
                }}
            />
        </TableRow>
    );
}
