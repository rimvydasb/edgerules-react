import type {ReactElement} from 'react';
import type {BoxedTableRowData} from '../boxed-editor-types';
import {ExpressionCell} from '../cells/ExpressionCell';
import {useRowCommands} from '../commands/useRowCommands';
import {useRowActions} from '../hooks/useRowActions';
import {useBoxedLayout} from '../context/BoxedLayoutContext';
import {rulesetTracks, SettingRow, SubGrid, sum, Track, type RulesetTracks} from '../primitives';
import * as classes from '../boxedEditor.module.css';
import {childPath} from '../../../lib/portableUtils';

export interface RulesetDefaultRowProps {
    row: BoxedTableRowData;
    /** The owning ruleset's column plan — "otherwise" spans the condition tracks. */
    tracks?: RulesetTracks;
}

/** Singleton fallback row shown when no rule matches — fixed, not draggable, not duplicable. */
export function RulesetDefaultRow({row, tracks: ownerTracks}: RulesetDefaultRowProps): ReactElement {
    // Rendered outside its ruleset (e.g. `RowSwitch`), the row plans its own tracks.
    const {valueUnits} = useBoxedLayout();
    const tracks = ownerTracks ?? rulesetTracks(row, valueUnits, false);
    const commands = useRowCommands();
    const actions = useRowActions(row);
    const actionColumns = row.actionColumns ?? [];

    const commitAction = (index: number, value: string) => {
        const actions = actionColumns.map((_, i) => (i === index ? value : (row.actions?.[i] ?? '')));
        const updated: BoxedTableRowData = {...row, actions};
        return commands.setBoxedRowData(row.path, updated);
    };

    return (
        <SettingRow row={row} name={row.name} depth={row.depth} showActions actions={actions} subGrid>
            <SubGrid>
                <Track units={sum(tracks.conditions)} className={classes.otherwise}>
                    otherwise
                </Track>
                {actionColumns.map((column, index) => (
                    <Track key={column} units={tracks.actions[index] ?? 0}>
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
                    </Track>
                ))}
                {tracks.priority !== undefined && <Track units={tracks.priority} aria-hidden />}
            </SubGrid>
        </SettingRow>
    );
}
