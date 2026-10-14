import {Alert} from '@mantine/core';
import type {KeyboardEvent, ReactElement, ReactNode} from 'react';
import {DescriptionCell} from '../cells/DescriptionCell';
import {NameCell} from '../cells/NameCell';
import {TestResultCell} from '../cells/TestResultCell';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {useBoxedEditorUi} from '../context/BoxedEditorUiContext';
import type {BoxedRowData, BoxedRowKind} from '../boxed-editor-types';
import {useRowDrag} from '../dnd/useRowDrag';
import {useRowDrop} from '../dnd/useRowDrop';
import {RowActionsMenu, type RowMenuItem} from '../menu/RowActionsMenu';
import {cx} from '../../../ui/cx';
import * as classes from '../boxedEditor.module.css';
import {
    Cell,
    Drag,
    gridTemplateColumns,
    RowActionsButton,
    RowLine,
    ROW_HEIGHT,
    TALL_ROW_HEIGHT,
    TallIconHandle,
    TypeName,
} from '../primitives';

// `Row` is the generic leaf row every `BoxedRowKind` in this phase (and most of the rest)
// reduces to once laid out — only `kind`-driven display flags change between them (which the
// row-kind components in this folder supply). Higher-level constructs (function/ruleset/
// optimisation header rows, Phase 4) may still compose it for their name/icon column.

/** Kinds whose `name` is a real, user-owned identifier `rename()` can commit — everything else
 * (`model`'s fixed root name; positional `list-item`/`relation-item`/`rule`, whose "name" is a
 * synthesized `Item N`/`Rule N` display, not stored identity; and the fixed construct-setting rows
 * like `function-result`/`ruleset-hit-policy`/`optimisation-objective`) keeps plain static text. */
const RENAMABLE_KINDS = new Set<BoxedRowKind>([
    'field',
    'context',
    'complexType',
    'function',
    'ruleset',
    'optimisation',
    'list',
    'relation',
    'optimisation-variable',
    'optimisation-constraint',
]);

export interface GenericRowProps {
    /** The full row data — enables this row's drag/drop wiring (Phase 6) when its `kind` is
     * sortable. Omitted by `NewRow`'s synthetic placeholder and the fixed `model` root. */
    row?: BoxedRowData;
    name: ReactNode;
    value?: ReactNode;
    type?: string;
    depth: number;
    icon?: ReactNode;
    iconBgColor?: string;
    /** The icon is this row's own drag handle (e.g. `complexType`) — no separate `Drag` cell. */
    iconActsAsDragHandle?: boolean;
    /** `false` for fixed/non-sortable rows (`model`). */
    showDragHandle?: boolean;
    occupiesNameAndValue?: boolean;
    strong?: boolean;
    placeholder?: boolean;
    tall?: boolean;
    /** Skips the ellipsis-text wrapper around `value` — pass true when `value` renders its own
     * layout (e.g. `ExpressionCell`, which swaps between static text and a full-width editor). */
    valueIsInteractive?: boolean;
    /** `false` suppresses the three-dot menu button — the trailing `NewRow` placeholder has no
     * actions of its own; an empty `ActionsColumn`-width cell fills the gap instead. */
    showActions?: boolean;
    /** The row's own menu items (`useRowActions`). No button renders when empty, regardless of
     * `showActions` (e.g. `ruleset-hit-policy`, or any row whose only actions were filtered out
     * under `readOnly`). */
    actions?: RowMenuItem[];
    /** Makes the whole row respond to click/Enter/Space — used by the trailing `NewRow`
     * placeholder to append without opening a menu. */
    onActivate?: () => void;
}

export function GenericRow({
    row,
    name,
    value,
    type,
    depth,
    icon,
    iconBgColor,
    iconActsAsDragHandle = false,
    showDragHandle = true,
    occupiesNameAndValue = false,
    strong = false,
    placeholder = false,
    tall = false,
    valueIsInteractive = false,
    showActions = true,
    actions = [],
    onActivate,
}: GenericRowProps): ReactElement {
    const {showDescription, showTestResults, showType, testCasesService} = useBoxedEditorContext();
    const {rowErrors} = useBoxedEditorUi();
    const rowError = row ? rowErrors.get(row.path) : undefined;
    // The `TestResultsColumn` is hidden entirely (not just emptied) when no `testCasesService` is
    // provided — unlike `showDescription`, which always shows the column (empty + read-only).
    const showTestResultsColumn = showTestResults && testCasesService !== undefined;
    const height = tall ? TALL_ROW_HEIGHT : ROW_HEIGHT;
    const drag = useRowDrag(row);
    const drop = useRowDrop(row);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (!onActivate) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onActivate();
        }
    };

    return (
        <div
            ref={drop.setNodeRef}
            data-testid={row ? `row-${row.path}` : undefined}
            role={onActivate ? 'button' : undefined}
            tabIndex={onActivate ? 0 : undefined}
            onClick={onActivate}
            onKeyDown={onActivate ? handleKeyDown : undefined}
            className={cx(
                classes.row,
                onActivate && classes.rowClickable,
                drag.isDragging && classes.rowDragging,
                drop.isOver && (drop.canDrop ? classes.dropOk : classes.dropBad),
            )}
            style={{
                gridTemplateColumns: gridTemplateColumns({
                    showDescription,
                    showTestResults: showTestResultsColumn,
                }),
                height,
            }}
        >
            <div className={cx(classes.nameColumn, occupiesNameAndValue && classes.span2)}>
                {Array.from({length: depth}, (_, index) => (
                    <div key={index} aria-hidden="true" className={classes.indent} />
                ))}
                {showDragHandle && !iconActsAsDragHandle && (
                    <Drag
                        dragRef={drag.setNodeRef}
                        dragListeners={drag.listeners}
                        dragAttributes={drag.attributes}
                        draggable={drag.draggable}
                    />
                )}
                {icon && (
                    <TallIconHandle
                        ariaLabel={iconActsAsDragHandle ? 'Drag to reorder row' : undefined}
                        style={{backgroundColor: iconBgColor}}
                        dragRef={iconActsAsDragHandle ? drag.setNodeRef : undefined}
                        dragListeners={iconActsAsDragHandle ? drag.listeners : undefined}
                        dragAttributes={iconActsAsDragHandle ? drag.attributes : undefined}
                        draggable={iconActsAsDragHandle && drag.draggable}
                    >
                        {icon}
                    </TallIconHandle>
                )}
                <TypeName
                    type={showType ? type : undefined}
                    className={cx(strong && classes.strong, placeholder && classes.placeholder)}
                    style={{paddingInline: 8}}
                >
                    {row && RENAMABLE_KINDS.has(row.kind) ? <NameCell row={row} /> : name}
                </TypeName>
            </div>
            {!occupiesNameAndValue && (
                <Cell>
                    {valueIsInteractive ? (
                        value
                    ) : (
                        <span className={cx(classes.ellipsis, placeholder && classes.placeholder)}>{value}</span>
                    )}
                </Cell>
            )}
            {showActions && actions.length > 0 ? (
                <RowActionsMenu items={actions}>
                    <RowActionsButton tall={tall} />
                </RowActionsMenu>
            ) : (
                <div aria-hidden="true" className={classes.actionsFiller} style={{height}} />
            )}
            {showDescription && <Cell column="description">{row && <DescriptionCell path={row.path} />}</Cell>}
            {showTestResultsColumn && <Cell column="test-results">{row && <TestResultCell path={row.path} />}</Cell>}
            {rowError && (
                <div className={classes.rowError}>
                    <Alert
                        color="red"
                        variant="light"
                        role="alert"
                        data-testid={`row-error-${row?.path}`}
                        py={0}
                        px="xs"
                    >
                        {rowError.path ? `${rowError.path}: ` : ''}
                        {rowError.message}
                    </Alert>
                </div>
            )}
            <RowLine />
        </div>
    );
}
