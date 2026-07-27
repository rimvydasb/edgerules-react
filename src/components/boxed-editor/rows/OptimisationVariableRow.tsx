import type { ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { ExpressionCell } from '../cells/ExpressionCell';
import { GenericRow } from './GenericRow';

export interface OptimisationVariableRowProps {
  row: BoxedRowData;
}

/** One decision variable (a Typed Input Wrapper) — draggable, `Duplicate`/`Delete`. */
export function OptimisationVariableRow({ row }: OptimisationVariableRowProps): ReactElement {
  return (
    <GenericRow
      name={row.name}
      value={<ExpressionCell row={row} />}
      valueIsInteractive
      depth={row.depth}
    />
  );
}
