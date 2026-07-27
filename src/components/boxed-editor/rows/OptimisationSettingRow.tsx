import type { ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { ExpressionCell } from '../cells/ExpressionCell';
import { DropdownChip, SettingRow } from '../primitives';

export interface OptimisationSettingRowProps {
  row: BoxedRowData;
}

/** Fixed `using` / `bottlenecks` / `timeLimit` setting — control matches its literal type. */
export function OptimisationSettingRow({ row }: OptimisationSettingRowProps): ReactElement {
  return (
    <SettingRow name={row.name} depth={row.depth}>
      {row.name === 'timeLimit' ? (
        <ExpressionCell row={row} />
      ) : (
        <DropdownChip>{row.value}</DropdownChip>
      )}
    </SettingRow>
  );
}
