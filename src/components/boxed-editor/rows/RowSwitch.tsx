import type { ReactElement } from 'react';
import type { BoxedRowData, BoxedTableRowData } from '../boxed-editor-types';
import { ComplexTypeRow } from './ComplexTypeRow';
import { ContextRow } from './ContextRow';
import { FieldRow } from './FieldRow';
import { ListItemRow } from './ListItemRow';
import { ListRow } from './ListRow';
import { ModelHeaderRow } from './ModelHeaderRow';
import { PlaceholderRow } from './PlaceholderRow';
import { RelationItemRow } from './RelationItemRow';
import { RelationRow } from './RelationRow';

export interface RowSwitchProps {
  row: BoxedRowData;
}

/**
 * Maps every `BoxedRowKind` to its row component. `model`/`field`/`context`/`complexType`
 * (Phase 1) and `list`/`list-item`/`relation`/`relation-item` (Phase 3) are implemented — the
 * rest render `PlaceholderRow` until Phase 4 lands. Every kind is listed explicitly (no `default`
 * branch) so adding a 22nd kind without a case here is a compile error.
 */
export function RowSwitch({ row }: RowSwitchProps): ReactElement {
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
    case 'function-result':
    case 'ruleset':
    case 'rule':
    case 'ruleset-default':
    case 'ruleset-hit-policy':
    case 'optimisation':
    case 'optimisation-setting':
    case 'optimisation-variable-group':
    case 'optimisation-variable':
    case 'optimisation-objective':
    case 'optimisation-constraint-group':
    case 'optimisation-constraint':
      return <PlaceholderRow row={row} />;
  }
}
