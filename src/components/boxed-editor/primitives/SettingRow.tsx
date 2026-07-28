import Box from '@mui/material/Box';
import SettingsIcon from '@mui/icons-material/Settings';
import type {ReactElement, ReactNode} from 'react';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {RowActionsMenu, type RowMenuItem} from '../menu/RowActionsMenu';
import {useRowMenu} from '../menu/useRowMenu';
import {Cell} from './Cell';
import {ACTIONS_COLUMN_WIDTH, CELL, gridTemplateColumns} from './layout';
import {RowActionsButton} from './RowActionsButton';
import {RowLine} from './RowLine';

export interface SettingRowProps {
    name: ReactNode;
    depth?: number;
    children?: ReactNode;
    description?: ReactNode;
    result?: ReactNode;
    occupiesNameAndValue?: boolean;
    /** Whether this fixed setting has any menu actions (e.g. `optimisation-variable-group`'s
     * "Add variable"). Plain settings like `hitPolicy` render no button — see Phase 5's registry. */
    showActions?: boolean;
    /** This row's own menu items (`useRowActions`). No button renders when empty. */
    actions?: RowMenuItem[];
}

/**
 * A fixed, non-reorderable row for a construct-level setting or a named structural block
 * (Ruleset's `hitPolicy`, Optimisation's `variables`/`constraints` groups, its objective, ...).
 * Gear icon instead of a drag handle. First consumed by Phase 4's ruleset/optimisation rows.
 */
export function SettingRow({
    name,
    depth = 1,
    children,
    description,
    result,
    occupiesNameAndValue = false,
    showActions = false,
    actions = [],
}: SettingRowProps): ReactElement {
    const {showDescription, showTestResults} = useBoxedEditorContext();
    const menu = useRowMenu();

    return (
        <Box
            sx={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: gridTemplateColumns({showDescription, showTestResults}),
                height: CELL,
                bgcolor: 'background.paper',
            }}
        >
            <Box
                sx={{
                    display: 'flex',
                    minWidth: 0,
                    alignItems: 'center',
                    borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                    bgcolor: 'action.hover',
                    gridColumn: occupiesNameAndValue ? 'span 2' : undefined,
                }}
            >
                {Array.from({length: depth}, (_, index) => (
                    <Box
                        key={index}
                        sx={{
                            width: CELL,
                            height: CELL,
                            flexShrink: 0,
                            borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                        }}
                    />
                ))}
                <Box
                    aria-hidden="true"
                    sx={{
                        display: 'flex',
                        width: CELL,
                        height: CELL,
                        flexShrink: 0,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                    }}
                >
                    <SettingsIcon sx={{fontSize: 18, color: 'text.secondary'}} />
                </Box>
                <Box
                    component="span"
                    sx={{
                        px: 1,
                        fontWeight: 600,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {name}
                </Box>
            </Box>
            {!occupiesNameAndValue && <Cell>{children}</Cell>}
            {showActions && actions.length > 0 ? (
                <>
                    <RowActionsButton onClick={menu.open} />
                    <RowActionsMenu items={actions} anchorEl={menu.anchorEl} onClose={menu.close} />
                </>
            ) : (
                <Box
                    sx={{
                        width: ACTIONS_COLUMN_WIDTH,
                        borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                        bgcolor: 'action.hover',
                    }}
                />
            )}
            {showDescription && <Cell column="description">{description}</Cell>}
            {showTestResults && <Cell column="test-results">{result}</Cell>}
            <RowLine />
        </Box>
    );
}
