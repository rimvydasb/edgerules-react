import type { ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { ExpressionCell } from '../cells/ExpressionCell';
import { useRowActions } from '../hooks/useRowActions';
import { SettingRow } from '../primitives';

export interface OptimisationObjectiveRowProps {
  row: BoxedRowData;
}

/**
 * Fixed `maximise`/`minimise` row — exactly one, required, not draggable. `row.name` carries the
 * current direction (`"maximise"` | `"minimise"`); switching it is a whole-row commit (`name` +
 * `value`) at this same path, coalesced by the service into the owning `optimise` declaration —
 * see `denormalize.ts`'s `optimisationNode` and the `mutation.test.ts` "coalesces optimisation
 * child edits" case for the exact shape.
 */
export function OptimisationObjectiveRow({ row }: OptimisationObjectiveRowProps): ReactElement {
  const actions = useRowActions(row);
  return (
    <SettingRow name={row.name} depth={row.depth} showActions actions={actions}>
      <ExpressionCell row={row} />
    </SettingRow>
  );
}
