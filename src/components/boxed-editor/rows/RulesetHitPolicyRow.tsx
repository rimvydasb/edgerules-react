import type {ReactElement} from 'react';
import type {BoxedRowData} from '../boxed-editor-types';
import {DropdownChip, SettingRow} from '../primitives';

export interface RulesetHitPolicyRowProps {
    row: BoxedRowData;
}

/** Fixed `hitPolicy` setting — picked via its own chip, no context menu of its own. */
export function RulesetHitPolicyRow({row}: RulesetHitPolicyRowProps): ReactElement {
    return (
        <SettingRow name={row.name} depth={row.depth}>
            <DropdownChip>{row.value}</DropdownChip>
        </SettingRow>
    );
}
