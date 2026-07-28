import Box from '@mui/material/Box';
import {Fragment, type ReactElement} from 'react';
import type {BoxedTableRowData} from '../boxed-editor-types';
import {useRowActions} from '../hooks/useRowActions';
import {ColumnDragHandle, TypeName} from '../primitives';
import {GenericRow} from './GenericRow';
import {NewRow} from './NewRow';
import {RowSwitch} from './RowSwitch';

export interface RelationRowProps {
    row: BoxedTableRowData;
}

/** The column-header sub-grid a `relation` header row owns — one cell per entry in `columns`. */
function RelationColumnHeaders({columns}: {columns: string[]}): ReactElement {
    return (
        <Box sx={{display: 'flex', width: '100%', height: '100%'}}>
            {columns.map((column) => (
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
                    <ColumnDragHandle />
                    <TypeName sx={{px: 1}}>{column}</TypeName>
                </Box>
            ))}
        </Box>
    );
}

/** Header of a homogeneous complex-object collection; its records are `relation-item` rows. */
export function RelationRow({row}: RelationRowProps): ReactElement {
    const columns = row.columns ?? [];
    const actions = useRowActions(row);
    return (
        <Fragment>
            <GenericRow
                row={row}
                name={row.name}
                depth={row.depth}
                strong
                value={<RelationColumnHeaders columns={columns} />}
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
