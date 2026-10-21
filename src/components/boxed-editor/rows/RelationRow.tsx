import type {ReactElement} from 'react';
import type {BoxedTableRowData} from '../boxed-editor-types';
import {moveRelationColumn, renameRelationColumn} from '../commands/rowFactories';
import {useRowCommands} from '../commands/useRowCommands';
import {useRowActions} from '../hooks/useRowActions';
import {EditableColumnHeader} from '../primitives/EditableColumnHeader';
import {useBoxedLayout} from '../context/BoxedLayoutContext';
import {splitUnits, SubGrid, Track} from '../primitives';
import {GenericRow} from './GenericRow';
import {NewRow} from './NewRow';
import {RowSwitch} from './RowSwitch';

export interface RelationRowProps {
    row: BoxedTableRowData;
}

/** The column-header sub-grid a `relation` header row owns — one cell per entry in `columns`. */
function RelationColumnHeaders({row}: {row: BoxedTableRowData}): ReactElement {
    const columns = row.columns ?? [];
    const units = splitUnits(columns.length, useBoxedLayout().valueUnits);
    const commands = useRowCommands();
    const commit = (next: BoxedTableRowData): string | undefined =>
        commands.setBoxedRowData(row.path, next, row.path)?.message;
    return (
        <SubGrid>
            {columns.map((column, index) => (
                <Track key={column} units={units[index]} pad={false}>
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
                </Track>
            ))}
        </SubGrid>
    );
}

/** Header of a homogeneous complex-object collection; its records are `relation-item` rows. */
export function RelationRow({row}: RelationRowProps): ReactElement {
    const actions = useRowActions(row);
    return (
        <>
            <GenericRow
                row={row}
                name={row.name}
                depth={row.depth}
                strong
                value={<RelationColumnHeaders row={row} />}
                valueIsSubGrid
                actions={actions}
            />
            {row.children?.map((child) => (
                <RowSwitch key={child.path} row={child} />
            ))}
            <NewRow row={row} />
        </>
    );
}
