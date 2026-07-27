import type { ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { ComplexTypeRow } from './ComplexTypeRow';
import { ContextRow } from './ContextRow';
import { FieldRow } from './FieldRow';
import { ModelHeaderRow } from './ModelHeaderRow';
import { PlaceholderRow } from './PlaceholderRow';

export interface RowSwitchProps {
  row: BoxedRowData;
}

/**
 * Maps every `BoxedRowKind` to its row component. Only `model`/`field`/`context`/`complexType`
 * are implemented in this phase — the rest render `PlaceholderRow` until Phases 3–4 land. Every
 * kind is listed explicitly (no `default` branch) so adding a 22nd kind without a case here is a
 * compile error.
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
    case 'list-item':
    case 'relation':
    case 'relation-item':
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
