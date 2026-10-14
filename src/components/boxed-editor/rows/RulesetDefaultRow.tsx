import type {ReactElement} from 'react';
import type {BoxedTableRowData} from '../boxed-editor-types';
import {ExpressionCell} from '../cells/ExpressionCell';
import {useRowCommands} from '../commands/useRowCommands';
import {useRowActions} from '../hooks/useRowActions';
import {SettingRow} from '../primitives';
import {cx} from '../../../ui/cx';
import * as classes from '../boxedEditor.module.css';
import {childPath} from '../service/portable-utils';

export interface RulesetDefaultRowProps {
    row: BoxedTableRowData;
}

/** Singleton fallback row shown when no rule matches — fixed, not draggable, not duplicable. */
export function RulesetDefaultRow({row}: RulesetDefaultRowProps): ReactElement {
    const commands = useRowCommands();
    const actions = useRowActions(row);
    const actionColumns = row.actionColumns ?? [];

    const commitAction = (index: number, value: string) => {
        const actions = actionColumns.map((_, i) => (i === index ? value : (row.actions?.[i] ?? '')));
        const updated: BoxedTableRowData = {...row, actions};
        return commands.setBoxedRowData(row.path, updated);
    };

    return (
        <SettingRow row={row} name={row.name} depth={row.depth} showActions actions={actions}>
            <div className={classes.fill}>
                <div className={classes.otherwise}>otherwise</div>
                {actionColumns.map((column, index) => (
                    <div
                        key={column}
                        className={cx(classes.groupCell, classes.pad, classes.groupLeft)}
                        style={index === 0 ? undefined : {borderLeftWidth: 1}}
                    >
                        <ExpressionCell
                            row={{
                                kind: 'field',
                                depth: row.depth,
                                path: childPath(row.path, column),
                                name: column,
                                value: row.actions?.[index] ?? '',
                            }}
                            onCommit={(value) => commitAction(index, value)}
                        />
                    </div>
                ))}
            </div>
        </SettingRow>
    );
}
