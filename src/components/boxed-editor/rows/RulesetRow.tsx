import {IconListCheck} from '@tabler/icons-react';
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
import {useBoxedLayout} from '../context/BoxedLayoutContext';
import {useRowActions} from '../hooks/useRowActions';
import {cx} from '../../../ui/cx';
import * as classes from '../boxedEditor.module.css';
import {rulesetTracks, SubGrid, SubGridStack, sum, Track, type RulesetTracks} from '../primitives';
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
 * band line, then one track per condition and action column. Track widths come from the ruleset's
 * shared `RulesetTracks`, so the rule and default rows below line up on the same step lines.
 */
function RulesetColumnHeaders({row, tracks}: {row: BoxedTableRowData; tracks: RulesetTracks}): ReactElement {
    const conditions: HeaderColumn[] = (row.parameters ?? []).map((parameter) => ({
        name: parameter.name,
        type: parameter.type,
    }));
    const actions: HeaderColumn[] = (row.actionColumns ?? []).map((name) => ({name}));
    const commands = useRowCommands();
    const commit = (next: BoxedTableRowData): string | undefined =>
        commands.setBoxedRowData(row.path, next, row.path)?.message;

    return (
        <SubGridStack>
            <SubGrid divided>
                <Track units={sum(tracks.conditions)} className={classes.bandLabel}>
                    conditions
                </Track>
                <Track
                    units={sum(tracks.actions)}
                    className={cx(classes.bandLabel, classes.bandActions, classes.bandActionsLabel)}
                >
                    actions
                </Track>
                {tracks.priority !== undefined && (
                    <Track units={tracks.priority} className={classes.bandLabel}>
                        priority
                    </Track>
                )}
            </SubGrid>
            <SubGrid>
                {conditions.length === 0 && <Track units={tracks.conditions[0]} aria-hidden />}
                {conditions.map((column, index) => (
                    <Track key={column.name} units={tracks.conditions[index]} pad={false}>
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
                    </Track>
                ))}
                {actions.length === 0 && (
                    <Track units={tracks.actions[0]} className={classes.bandActions} aria-hidden />
                )}
                {actions.map((column, index) => (
                    <Track key={column.name} units={tracks.actions[index]} pad={false} className={classes.bandActions}>
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
                    </Track>
                ))}
                {tracks.priority !== undefined && <Track units={tracks.priority} aria-hidden />}
            </SubGrid>
        </SubGridStack>
    );
}

/** A named rule matrix (DMN-style decision table) — tall header row, then its fixed child rows. */
export function RulesetRow({row}: RulesetRowProps): ReactElement {
    const {isExpanded} = useBoxedEditorUi();
    const expanded = isExpanded(row.path);
    const menuActions = useRowActions(row);
    const hitPolicy = (row.children ?? []).find((child) => child.kind === 'ruleset-hit-policy')?.value;
    const showPriority = hitPolicy === 'best-match';
    const {valueUnits} = useBoxedLayout();
    const tracks = rulesetTracks(row, valueUnits, showPriority);

    return (
        <Fragment>
            <GenericRow
                row={row}
                name={row.name}
                depth={row.depth}
                tall
                strong
                iconActsAsDragHandle
                icon={<IconListCheck size={19} color="#fff" />}
                iconBgColor="#6a1b9a"
                value={<RulesetColumnHeaders row={row} tracks={tracks} />}
                valueIsSubGrid
                actions={menuActions}
            />
            {expanded && row.children?.map((child) => renderChild(child, tracks))}
            <NewRow row={row} />
        </Fragment>
    );
}

function renderChild(child: BoxedRowData, tracks: RulesetTracks): ReactElement | null {
    switch (child.kind) {
        case 'rule':
            return <RuleRow key={child.path} row={child as BoxedTableRowData} tracks={tracks} />;
        case 'ruleset-default':
            return <RulesetDefaultRow key={child.path} row={child as BoxedTableRowData} tracks={tracks} />;
        case 'ruleset-hit-policy':
            return <RulesetHitPolicyRow key={child.path} row={child} />;
        default:
            return null;
    }
}
