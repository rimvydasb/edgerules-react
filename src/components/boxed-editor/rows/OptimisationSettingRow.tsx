import type {ReactElement} from 'react';
import type {BoxedRowData} from '../boxed-editor-types';
import {ExpressionCell} from '../cells/ExpressionCell';
import {useRowCommands} from '../commands/useRowCommands';
import {DropdownChip, SettingRow} from '../primitives';

export interface OptimisationSettingRowProps {
    row: BoxedRowData;
}

/** Fixed `using` / `bottlenecks` / `timeLimit` setting — control matches its literal type. */
export function OptimisationSettingRow({row}: OptimisationSettingRowProps): ReactElement {
    const commands = useRowCommands();
    const options = row.name === 'using' ? ['highs'] : ['true', 'false'];
    return (
        <SettingRow row={row} name={row.name} depth={row.depth}>
            {row.name === 'timeLimit' ? (
                <ExpressionCell row={row} />
            ) : (
                <DropdownChip
                    ariaLabel={`Change ${row.name}`}
                    options={options}
                    onChange={(value) => {
                        commands.setBoxedRowData(row.path, {...row, value}, row.path);
                    }}
                >
                    {row.value}
                </DropdownChip>
            )}
        </SettingRow>
    );
}
