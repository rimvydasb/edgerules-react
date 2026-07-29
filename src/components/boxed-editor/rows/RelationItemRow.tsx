import Box from '@mui/material/Box';
import {Fragment, type ReactElement} from 'react';
import type {BoxedTableRowData} from '../boxed-editor-types';
import {ExpressionCell} from '../cells/ExpressionCell';
import {useRowCommands} from '../commands/useRowCommands';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {useRowActions} from '../hooks/useRowActions';
import {childPath, parentPath, pathDepth} from '../service/portable-utils';
import {GenericRow} from './GenericRow';
import {RowSwitch} from './RowSwitch';

export interface RelationItemRowProps {
    row: BoxedTableRowData;
}

/**
 * One cell per column, aligned to the header. A column whose value is a complex object has no
 * DSL literal of its own — it renders blank here and as a drill-down row below (never JSON text).
 */
function RelationCells({row}: {row: BoxedTableRowData}): ReactElement {
    const {service} = useBoxedEditorContext();
    const commands = useRowCommands();
    const columns = row.columns ?? [];
    const cells = row.cells ?? [];
    const drillDownNames = new Set((row.children ?? []).map((child) => child.name));

    return (
        <Box sx={{display: 'flex', width: '100%', height: '100%'}}>
            {columns.map((column, index) => {
                const cellPath = childPath(row.path, column);
                return (
                    <Box
                        key={column}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            flex: 1,
                            minWidth: 0,
                            height: '100%',
                            px: 1,
                            borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                            '&:last-of-type': {borderRight: 'none'},
                        }}
                    >
                        {drillDownNames.has(column) ? null : (
                            <ExpressionCell
                                row={{
                                    kind: 'field',
                                    depth: pathDepth(cellPath),
                                    path: cellPath,
                                    name: column,
                                    value: cells[index] ?? '',
                                }}
                                onCommit={(value) => {
                                    const relationPath = parentPath(row.path);
                                    if (!relationPath) return undefined;
                                    const relation = service.getBoxedRowData(relationPath) as
                                        | BoxedTableRowData
                                        | undefined;
                                    if (!relation) return undefined;
                                    const children = service.getBoxedRowsData(relationPath);
                                    return commands.setBoxedRowData(
                                        relationPath,
                                        {
                                            ...relation,
                                            children: children.map((child) => {
                                                if (child.path !== row.path) return child;
                                                const item = child as BoxedTableRowData;
                                                const nextCells = [...(item.cells ?? [])];
                                                nextCells[index] = value;
                                                return {...item, cells: nextCells};
                                            }),
                                        },
                                        row.path,
                                    );
                                }}
                            />
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}

/**
 * One record of a `relation`. A cell holding a complex object drills down into nested rows
 * (rendered below, already normalized by the service) instead of showing its value inline.
 */
export function RelationItemRow({row}: RelationItemRowProps): ReactElement {
    const actions = useRowActions(row);
    return (
        <Fragment>
            <GenericRow
                row={row}
                name={row.name}
                depth={row.depth}
                value={<RelationCells row={row} />}
                valueIsInteractive
                actions={actions}
            />
            {row.children?.map((child) => (
                <RowSwitch key={child.path} row={child} />
            ))}
        </Fragment>
    );
}
