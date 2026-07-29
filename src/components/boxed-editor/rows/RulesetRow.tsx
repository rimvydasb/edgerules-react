import Box from '@mui/material/Box';
import {alpha} from '@mui/material/styles';
import RuleIcon from '@mui/icons-material/Rule';
import {Fragment, type ReactElement} from 'react';
import type {BoxedRowData, BoxedTableRowData} from '../boxed-editor-types';
import {
    moveActionColumn,
    moveConditionColumn,
    renameActionColumn,
    renameConditionColumn,
    retypeConditionColumn,
} from '../commands/rowFactories';
import {useRowCommands} from '../commands/useRowCommands';
import {useBoxedEditorUi} from '../context/BoxedEditorUiContext';
import {useRowActions} from '../hooks/useRowActions';
import {CELL, TALL_ROW_HEIGHT} from '../primitives';
import {EditableColumnHeader} from '../primitives/EditableColumnHeader';
import {GenericRow} from './GenericRow';
import {NewRow} from './NewRow';
import {RuleRow} from './RuleRow';
import {RulesetDefaultRow} from './RulesetDefaultRow';
import {RulesetHitPolicyRow} from './RulesetHitPolicyRow';

export interface RulesetRowProps {
    row: BoxedTableRowData;
}

interface HeaderColumn {
    name: string;
    type?: string;
}

/**
 * Two-tier condition/action header block a `ruleset` header row owns — a "conditions"/"actions"
 * label row, then one cell per condition and action column, proportioned so the data rows below
 * (`RuleRow`) line up exactly (same `flex` weights per group).
 */
function RulesetColumnHeaders({
    row,
    showPriority,
}: {
    row: BoxedTableRowData;
    showPriority: boolean;
}): ReactElement {
    const conditions: HeaderColumn[] = (row.parameters ?? []).map((parameter) => ({
        name: parameter.name,
        type: parameter.type,
    }));
    const actions: HeaderColumn[] = (row.actionColumns ?? []).map((name) => ({name}));
    const commands = useRowCommands();
    const commit = (next: BoxedTableRowData): string | undefined =>
        commands.setBoxedRowData(row.path, next, row.path)?.message;
    const conditionWeight = conditions.length || 1;
    const actionWeight = actions.length || 1;
    const priorityWeight = 1;

    return (
        <Box sx={{display: 'flex', flexDirection: 'column', width: '100%', height: TALL_ROW_HEIGHT}}>
            <Box
                sx={{
                    display: 'flex',
                    height: CELL,
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        flex: conditionWeight,
                        minWidth: 0,
                        px: 1,
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'text.secondary',
                        borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                    }}
                >
                    conditions
                </Box>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        flex: actionWeight,
                        minWidth: 0,
                        px: 1,
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'success.dark',
                        bgcolor: (theme) =>
                            alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.12 : 0.08),
                        borderRight: showPriority ? (theme) => `1px solid ${theme.palette.divider}` : 'none',
                    }}
                >
                    actions
                </Box>
                {showPriority && (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            flex: priorityWeight,
                            minWidth: 0,
                            px: 1,
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'text.secondary',
                        }}
                    >
                        priority
                    </Box>
                )}
            </Box>
            <Box sx={{display: 'flex', height: CELL}}>
                <Box sx={{display: 'flex', flex: conditionWeight, minWidth: 0}}>
                    {conditions.map((column, index) => (
                        <Box
                            key={column.name}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                flex: 1,
                                minWidth: 0,
                                borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                                '&:last-of-type': {borderRight: 'none'},
                            }}
                        >
                            <EditableColumnHeader
                                rowPath={row.path}
                                name={column.name}
                                type={column.type}
                                typeEditable
                                index={index}
                                count={conditions.length}
                                onRename={(name) => {
                                    if (name !== column.name && conditions.some((item) => item.name === name)) {
                                        return `A column named "${name}" already exists.`;
                                    }
                                    return commit(renameConditionColumn(row, column.name, name));
                                }}
                                onRetype={(type) => commit(retypeConditionColumn(row, column.name, type))}
                                onMove={(to) => {
                                    commit(moveConditionColumn(row, index, to));
                                }}
                            />
                        </Box>
                    ))}
                </Box>
                <Box
                    sx={{
                        display: 'flex',
                        flex: actionWeight,
                        minWidth: 0,
                        borderLeft: (theme) => `2px solid ${theme.palette.divider}`,
                    }}
                >
                    {actions.map((column, index) => (
                        <Box
                            key={column.name}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                flex: 1,
                                minWidth: 0,
                                borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                                '&:last-of-type': {borderRight: 'none'},
                            }}
                        >
                            <EditableColumnHeader
                                rowPath={row.path}
                                name={column.name}
                                index={index}
                                count={actions.length}
                                onRename={(name) => {
                                    if (name !== column.name && actions.some((item) => item.name === name)) {
                                        return `A column named "${name}" already exists.`;
                                    }
                                    return commit(renameActionColumn(row, column.name, name));
                                }}
                                onMove={(to) => {
                                    commit(moveActionColumn(row, index, to));
                                }}
                            />
                        </Box>
                    ))}
                </Box>
                {showPriority && (
                    <Box
                        aria-hidden="true"
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            flex: priorityWeight,
                            minWidth: 0,
                            px: 1,
                            borderLeft: (theme) => `2px solid ${theme.palette.divider}`,
                        }}
                    />
                )}
            </Box>
        </Box>
    );
}

/** A named rule matrix (DMN-style decision table) — tall header row, then its fixed child rows. */
export function RulesetRow({row}: RulesetRowProps): ReactElement {
    const {isExpanded} = useBoxedEditorUi();
    const expanded = isExpanded(row.path);
    const menuActions = useRowActions(row);
    const hitPolicy = (row.children ?? []).find((child) => child.kind === 'ruleset-hit-policy')?.value;
    const showPriority = hitPolicy === 'best-match';

    return (
        <Fragment>
            <GenericRow
                row={row}
                name={row.name}
                depth={row.depth}
                tall
                strong
                iconActsAsDragHandle
                icon={<RuleIcon sx={{fontSize: 19, color: '#fff'}} />}
                iconBgColor="#6a1b9a"
                value={<RulesetColumnHeaders row={row} showPriority={showPriority} />}
                valueIsInteractive
                actions={menuActions}
            />
            {expanded && row.children?.map((child) => renderChild(child, showPriority))}
            <NewRow row={row} />
        </Fragment>
    );
}

function renderChild(child: BoxedRowData, showPriority: boolean): ReactElement | null {
    switch (child.kind) {
        case 'rule':
            return <RuleRow key={child.path} row={child as BoxedTableRowData} showPriority={showPriority} />;
        case 'ruleset-default':
            return <RulesetDefaultRow key={child.path} row={child as BoxedTableRowData} />;
        case 'ruleset-hit-policy':
            return <RulesetHitPolicyRow key={child.path} row={child} />;
        default:
            return null;
    }
}
