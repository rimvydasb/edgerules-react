import Box from '@mui/material/Box';
import {Fragment, type ReactElement} from 'react';
import type {BoxedTableRowData} from '../boxed-editor-types';
import {moveRelationColumn, renameRelationColumn} from '../commands/rowFactories';
import {useRowCommands} from '../commands/useRowCommands';
import {useRowActions} from '../hooks/useRowActions';
import {EditableColumnHeader} from '../primitives/EditableColumnHeader';
import {GenericRow} from './GenericRow';
import {NewRow} from './NewRow';
import {RowSwitch} from './RowSwitch';

export interface RelationRowProps {
    row: BoxedTableRowData;
}

/** The column-header sub-grid a `relation` header row owns — one cell per entry in `columns`. */
function RelationColumnHeaders({row}: {row: BoxedTableRowData}): ReactElement {
    const columns = row.columns ?? [];
    const commands = useRowCommands();
    const commit = (next: BoxedTableRowData): string | undefined =>
        commands.setBoxedRowData(row.path, next, row.path)?.message;
    return (
        <Box sx={{display: 'flex', width: '100%', height: '100%'}}>
            {columns.map((column, index) => (
                <Box
                    key={column}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        flex: 1,
                        minWidth: 0,
                        height: '100%',
                        borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                        '&:last-of-type': {borderRight: 'none'},
                    }}
                >
                    <EditableColumnHeader
                        rowPath={row.path}
                        name={column}
                        index={index}
                        count={columns.length}
                        onRename={(name) => {
                            if (name !== column && columns.includes(name)) {
                                return `A column named "${name}" already exists.`;
                            }
                            return commit(renameRelationColumn(row, column, name));
                        }}
                        onMove={(to) => {
                            commit(moveRelationColumn(row, index, to));
                        }}
                    />
                </Box>
            ))}
        </Box>
    );
}

/** Header of a homogeneous complex-object collection; its records are `relation-item` rows. */
export function RelationRow({row}: RelationRowProps): ReactElement {
    const actions = useRowActions(row);
    return (
        <Fragment>
            <GenericRow
                row={row}
                name={row.name}
                depth={row.depth}
                strong
                value={<RelationColumnHeaders row={row} />}
                valueIsInteractive
                actions={actions}
            />
            {row.children?.map((child) => (
                <RowSwitch key={child.path} row={child} />
            ))}
            <NewRow row={row} />
        </Fragment>
    );
}
