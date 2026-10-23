import {Alert} from '@mantine/core';
import {IconSettings} from '@tabler/icons-react';
import type {ReactElement, ReactNode} from 'react';
import {cx} from '#ui/cx';
import {useBoxedEditorUi} from '../context/BoxedEditorUiContext';
import {useBoxedLayout} from '../context/BoxedLayoutContext';
import type {BoxedRowData} from '../boxed-editor-types';
import * as classes from '../boxedEditor.module.css';
import {RowActionsMenu, type RowMenuItem} from '#ui/RowActionsMenu';
import {Cell} from './Cell';
import {CELL} from './layout';
import {RowActionsButton} from './RowActionsButton';

export interface SettingRowProps {
    row?: BoxedRowData;
    name: ReactNode;
    depth?: number;
    children?: ReactNode;
    description?: ReactNode;
    result?: ReactNode;
    occupiesNameAndValue?: boolean;
    /** Whether this fixed setting has any menu actions (e.g. `optimisation-variable-group`'s
     * "Add variable"). Plain settings like `hitPolicy` render no button — see Phase 5's registry. */
    showActions?: boolean;
    /** `children` is a nested sub-grid (`SubGrid`) — the value cell drops its padding. */
    subGrid?: boolean;
    /** This row's own menu items (`useRowActions`). No button renders when empty. */
    actions?: RowMenuItem[];
}

/**
 * A fixed, non-reorderable row for a construct-level setting or a named structural block
 * (Ruleset's `hitPolicy`, Optimisation's `variables`/`constraints` groups, its objective, ...).
 * Gear icon instead of a drag handle. First consumed by Phase 4's ruleset/optimisation rows.
 */
export function SettingRow({
    row,
    name,
    depth = 1,
    children,
    description,
    result,
    occupiesNameAndValue = false,
    showActions = false,
    subGrid = false,
    actions = [],
}: SettingRowProps): ReactElement {
    const {template, showDescription, showTestResults} = useBoxedLayout();
    const {rowErrors} = useBoxedEditorUi();
    const rowError = row ? rowErrors.get(row.path) : undefined;

    return (
        <div
            data-testid={row ? `row-${row.path}` : undefined}
            className={classes.row}
            style={{gridTemplateColumns: template, height: CELL}}
        >
            <div className={cx(classes.nameColumn, occupiesNameAndValue && classes.span2)}>
                {Array.from({length: depth}, (_, index) => (
                    <div key={index} className={classes.indent} />
                ))}
                <div aria-hidden="true" className={classes.settingIcon}>
                    <IconSettings size={18} />
                </div>
                <span className={cx(classes.ellipsis, classes.strong)} style={{paddingInline: 8}}>
                    {name}
                </span>
            </div>
            {!occupiesNameAndValue && <Cell flush={subGrid}>{children}</Cell>}
            {showActions && actions.length > 0 ? (
                <RowActionsMenu items={actions}>
                    <RowActionsButton />
                </RowActionsMenu>
            ) : (
                <div className={classes.actionsFiller} />
            )}
            {showDescription && <Cell column="description">{description}</Cell>}
            {showTestResults && <Cell column="test-results">{result}</Cell>}
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
        </div>
    );
}
