import type {ReactElement} from 'react';
import type {PortableError} from '@edgerules/portable';
import type {BoxedTableRowData} from '../boxed-editor-types';
import {ExpressionCell} from '../cells/ExpressionCell';
import {useRowCommands} from '../commands/useRowCommands';
import {useRowActions} from '../hooks/useRowActions';
import {childPath} from '../../../lib/portableUtils';
import {useBoxedLayout} from '../context/BoxedLayoutContext';
import {rulesetTracks, SubGrid, sum, Track, type RulesetTracks} from '../primitives';
import {GenericRow} from './GenericRow';

export interface RuleRowProps {
    row: BoxedTableRowData;
    /** The owning ruleset's column plan. `tracks.priority` is set only under `"best-match"` — the
     * only policy under which `priority` is authored (required there, rejected elsewhere per
     * `RULESETS_REFERENCE.md`). */
    tracks?: RulesetTracks;
}

/**
 * One row of a `rule`'s condition/action matrix. Every cell commit rewrites and commits the
 * *whole* `rule` row (Section 7) rather than a synthetic per-cell leaf path — `denormalize`'s
 * `ruleNode` already implements "blank condition cell omits the key" (= "any") on that rewrite.
 */
function RuleCells({row, tracks}: {row: BoxedTableRowData; tracks: RulesetTracks}): ReactElement {
    const commands = useRowCommands();
    const conditionColumns = row.conditionColumns ?? [];
    const actionColumns = row.actionColumns ?? [];
    const hasExpression = row.conditionsExpression !== undefined;

    const commitConditionCell = (index: number, value: string): PortableError | undefined => {
        const conditions = conditionColumns.map((_, i) => (i === index ? value : (row.conditions?.[i] ?? '')));
        const updated: BoxedTableRowData = {...row, conditions, conditionsExpression: undefined};
        return commands.setBoxedRowData(row.path, updated);
    };
    const commitConditionsExpression = (value: string): PortableError | undefined => {
        const updated: BoxedTableRowData = {...row, conditionsExpression: value, conditions: undefined};
        return commands.setBoxedRowData(row.path, updated);
    };
    const commitActionCell = (index: number, value: string): PortableError | undefined => {
        const actions = actionColumns.map((_, i) => (i === index ? value : (row.actions?.[i] ?? '')));
        const updated: BoxedTableRowData = {...row, actions};
        return commands.setBoxedRowData(row.path, updated);
    };
    const commitPriority = (value: string): PortableError | undefined => {
        const priority = Number(value);
        if (!Number.isFinite(priority)) {
            return {
                '@kind': 'error',
                type: 'Parse',
                message: 'Priority must be a whole number',
                path: row.path,
            };
        }
        const updated: BoxedTableRowData = {...row, priority};
        return commands.setBoxedRowData(row.path, updated);
    };

    return (
        <SubGrid>
            {hasExpression ? (
                <Track units={sum(tracks.conditions)}>
                    <ExpressionCell
                        row={{
                            kind: 'field',
                            depth: row.depth,
                            path: childPath(row.path, 'when'),
                            name: 'when',
                            value: row.conditionsExpression ?? '',
                        }}
                        onCommit={commitConditionsExpression}
                    />
                </Track>
            ) : (
                <>
                    {conditionColumns.length === 0 && <Track units={tracks.conditions[0]} aria-hidden />}
                    {conditionColumns.map((column, index) => (
                        <Track key={column} units={tracks.conditions[index] ?? 0}>
                            <ExpressionCell
                                row={{
                                    kind: 'field',
                                    depth: row.depth,
                                    path: childPath(row.path, `when.${column}`),
                                    name: column,
                                    value: row.conditions?.[index] ?? '',
                                }}
                                onCommit={(value) => commitConditionCell(index, value)}
                            />
                        </Track>
                    ))}
                </>
            )}
            {actionColumns.length === 0 && <Track units={tracks.actions[0]} aria-hidden />}
            {actionColumns.map((column, index) => (
                <Track key={column} units={tracks.actions[index] ?? 0}>
                    <ExpressionCell
                        row={{
                            kind: 'field',
                            depth: row.depth,
                            path: childPath(row.path, `then.${column}`),
                            name: column,
                            value: row.actions?.[index] ?? '',
                        }}
                        onCommit={(value) => commitActionCell(index, value)}
                    />
                </Track>
            ))}
            {tracks.priority !== undefined && (
                <Track units={tracks.priority}>
                    <ExpressionCell
                        row={{
                            kind: 'field',
                            depth: row.depth,
                            path: childPath(row.path, 'priority'),
                            name: 'priority',
                            value: row.priority !== undefined ? String(row.priority) : '',
                        }}
                        onCommit={commitPriority}
                    />
                </Track>
            )}
        </SubGrid>
    );
}

/** One row of a decision table's rule matrix — draggable, `Duplicate`/`Delete` menu actions. */
export function RuleRow({row, tracks: ownerTracks}: RuleRowProps): ReactElement {
    // Rendered outside its ruleset (e.g. `RowSwitch`), the row plans its own tracks.
    const {valueUnits} = useBoxedLayout();
    const tracks = ownerTracks ?? rulesetTracks(row, valueUnits, row.priority !== undefined);
    const actions = useRowActions(row);
    return (
        <GenericRow
            row={row}
            name={row.name}
            depth={row.depth}
            value={<RuleCells row={row} tracks={tracks} />}
            valueIsSubGrid
            actions={actions}
        />
    );
}
