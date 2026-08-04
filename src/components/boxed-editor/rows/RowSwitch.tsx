import type {ReactElement} from 'react';
import type {BoxedRowData, BoxedTableRowData} from '../boxed-editor-types';
import {ComplexTypeRow} from './ComplexTypeRow';
import {ContextRow} from './ContextRow';
import {FieldRow} from './FieldRow';
import {FunctionResultRow} from './FunctionResultRow';
import {FunctionRow} from './FunctionRow';
import {ListItemRow} from './ListItemRow';
import {ListRow} from './ListRow';
import {ModelHeaderRow} from './ModelHeaderRow';
import {OptimisationConstraintGroupRow} from './OptimisationConstraintGroupRow';
import {OptimisationConstraintRow} from './OptimisationConstraintRow';
import {OptimisationObjectiveRow} from './OptimisationObjectiveRow';
import {OptimisationRow} from './OptimisationRow';
import {OptimisationSettingRow} from './OptimisationSettingRow';
import {OptimisationVariableGroupRow} from './OptimisationVariableGroupRow';
import {OptimisationVariableRow} from './OptimisationVariableRow';
import {RelationItemRow} from './RelationItemRow';
import {RelationRow} from './RelationRow';
import {RuleRow} from './RuleRow';
import {RulesetDefaultRow} from './RulesetDefaultRow';
import {RulesetHitPolicyRow} from './RulesetHitPolicyRow';
import {RulesetRow} from './RulesetRow';

export interface RowSwitchProps {
    row: BoxedRowData;
}

/**
 * Maps every `BoxedRowKind` to its row component — the full 21-kind vocabulary as of Phase 4.
 * Every kind is listed explicitly (no `default` branch) so adding a 22nd kind without a case here
 * is a compile error.
 *
 * `ruleset`/`optimisation` children (`rule`, `ruleset-default`, `ruleset-hit-policy`,
 * `optimisation-setting`, `optimisation-variable-group`, `optimisation-variable`,
 * `optimisation-objective`, `optimisation-constraint-group`, `optimisation-constraint`) are
 * normally rendered directly by `RulesetRow`/`OptimisationRow` (which need extra context, e.g.
 * `RuleRow`'s `showPriority`) rather than through this generic dispatch — the cases below exist so
 * every kind still has a standalone entry point (e.g. a `BoxedEditor` pointed directly at a rule's
 * own path).
 */
export function RowSwitch({row}: RowSwitchProps): ReactElement {
    switch (row.kind) {
        case 'model':
            return <ModelHeaderRow row={row} />;
        case 'field':
            return <FieldRow row={row} />;
        case 'context':
            return <ContextRow row={row} />;
        case 'complexType':
            return <ComplexTypeRow row={row} />;
        case 'list':
            return <ListRow row={row} />;
        case 'list-item':
            return <ListItemRow row={row} />;
        case 'relation':
            return <RelationRow row={row as BoxedTableRowData} />;
        case 'relation-item':
            return <RelationItemRow row={row as BoxedTableRowData} />;
        case 'function':
            return <FunctionRow row={row as BoxedTableRowData} />;
        case 'function-result':
            return <FunctionResultRow row={row} />;
        case 'ruleset':
            return <RulesetRow row={row as BoxedTableRowData} />;
        case 'rule':
            return <RuleRow row={row as BoxedTableRowData} />;
        case 'ruleset-default':
            return <RulesetDefaultRow row={row as BoxedTableRowData} />;
        case 'ruleset-hit-policy':
            return <RulesetHitPolicyRow row={row} />;
        case 'optimisation':
            return <OptimisationRow row={row as BoxedTableRowData} />;
        case 'optimisation-setting':
            return <OptimisationSettingRow row={row} />;
        case 'optimisation-variable-group':
            return <OptimisationVariableGroupRow row={row} />;
        case 'optimisation-variable':
            return <OptimisationVariableRow row={row} />;
        case 'optimisation-objective':
            return <OptimisationObjectiveRow row={row} />;
        case 'optimisation-constraint-group':
            return <OptimisationConstraintGroupRow row={row} />;
        case 'optimisation-constraint':
            return <OptimisationConstraintRow row={row} />;
    }
}
