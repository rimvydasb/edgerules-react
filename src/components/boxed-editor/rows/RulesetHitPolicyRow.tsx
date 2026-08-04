import type {ReactElement} from 'react';
import type {BoxedRowData, BoxedTableRowData} from '../boxed-editor-types';
import {compatibleLiteralDefault} from '../commands/rowFactories';
import {useRowCommands} from '../commands/useRowCommands';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {DropdownChip, SettingRow} from '../primitives';
import {childPath, parentPath} from '../service/portable-utils';

export interface RulesetHitPolicyRowProps {
    row: BoxedRowData;
}

/** Fixed `hitPolicy` setting — picked via its own chip, no context menu of its own. */
export function RulesetHitPolicyRow({row}: RulesetHitPolicyRowProps): ReactElement {
    const {service} = useBoxedEditorContext();
    const commands = useRowCommands();
    return (
        <SettingRow row={row} name={row.name} depth={row.depth}>
            <DropdownChip
                ariaLabel="Change hit policy"
                options={['first-match', 'best-match', 'unique-match', 'collect-matches']}
                onChange={(value) => {
                    const rulesetPath = parentPath(row.path);
                    if (!rulesetPath) return;
                    const ruleset = service.getBoxedRowData(rulesetPath) as BoxedTableRowData | undefined;
                    if (!ruleset) return;
                    let priority = 0;
                    let children = service
                        .getBoxedRowsData(rulesetPath)
                        .map((child) => {
                            if (child.kind === 'ruleset-hit-policy') return {...child, value};
                            if (child.kind === 'rule') {
                                priority += 1;
                                return {
                                    ...child,
                                    priority:
                                        value === 'best-match'
                                            ? ((child as BoxedTableRowData).priority ?? priority)
                                            : undefined,
                                };
                            }
                            return child;
                        });
                    if (value === 'collect-matches') {
                        children = children.filter((child) => child.kind !== 'ruleset-default');
                    } else if (!children.some((child) => child.kind === 'ruleset-default')) {
                        const reference = [...children]
                            .reverse()
                            .find((child) => child.kind === 'rule') as BoxedTableRowData | undefined;
                        children.push({
                            kind: 'ruleset-default',
                            depth: row.depth,
                            path: childPath(rulesetPath, 'default'),
                            name: 'default',
                            actionColumns: ruleset.actionColumns ?? [],
                            actions: (ruleset.actionColumns ?? []).map((_, index) =>
                                compatibleLiteralDefault(reference?.actions?.[index]),
                            ),
                            deletable: false,
                        } as BoxedTableRowData);
                    }
                    commands.setBoxedRowData(rulesetPath, {...ruleset, children}, row.path);
                }}
            >
                {row.value}
            </DropdownChip>
        </SettingRow>
    );
}
