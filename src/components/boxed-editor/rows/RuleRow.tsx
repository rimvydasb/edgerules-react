import type {ReactElement} from 'react';
import type {PortableError} from '@edgerules/portable';
import type {BoxedTableRowData} from '../boxed-editor-types';
import {ExpressionCell} from '../cells/ExpressionCell';
import {useRowCommands} from '../commands/useRowCommands';
import {useRowActions} from '../hooks/useRowActions';
import {childPath} from '../service/portable-utils';
import {cx} from '../../../ui/cx';
import * as classes from '../boxedEditor.module.css';
import {GenericRow} from './GenericRow';

export interface RuleRowProps {
    row: BoxedTableRowData;
    /** Whether the owning ruleset's `hitPolicy` is `"best-match"` — the only policy under which
     * `priority` is authored (required there, rejected elsewhere per `RULESETS_REFERENCE.md`). */
    showPriority?: boolean;
}

/**
 * One row of a `rule`'s condition/action matrix. Every cell commit rewrites and commits the
 * *whole* `rule` row (Section 7) rather than a synthetic per-cell leaf path — `denormalize`'s
 * `ruleNode` already implements "blank condition cell omits the key" (= "any") on that rewrite.
 */
function RuleCells({row, showPriority}: {row: BoxedTableRowData; showPriority: boolean}): ReactElement {
    const commands = useRowCommands();
    const conditionColumns = row.conditionColumns ?? [];
    const actionColumns = row.actionColumns ?? [];
    const conditionWeight = conditionColumns.length || 1;
    const actionWeight = actionColumns.length || 1;
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
        <div className={classes.fill}>
            {hasExpression ? (
                <div className={cx(classes.groupCell, classes.pad)} style={{flex: conditionWeight}}>
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
                </div>
            ) : (
                <div className={classes.group} style={{flex: conditionWeight}}>
                    {conditionColumns.map((column, index) => (
                        <div key={column} className={cx(classes.groupCell, classes.pad)}>
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
                        </div>
                    ))}
                </div>
            )}
            <div className={cx(classes.group, classes.groupLeft)} style={{flex: actionWeight}}>
                {actionColumns.map((column, index) => (
                    <div key={column} className={cx(classes.groupCell, classes.pad)}>
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
                    </div>
                ))}
            </div>
            {showPriority && (
                <div className={cx(classes.groupCell, classes.pad, classes.groupLeft)}>
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
                </div>
            )}
        </div>
    );
}

/** One row of a decision table's rule matrix — draggable, `Duplicate`/`Delete` menu actions. */
export function RuleRow({row, showPriority = false}: RuleRowProps): ReactElement {
    const actions = useRowActions(row);
    return (
        <GenericRow
            row={row}
            name={row.name}
            depth={row.depth}
            value={<RuleCells row={row} showPriority={showPriority} />}
            valueIsInteractive
            actions={actions}
        />
    );
}
