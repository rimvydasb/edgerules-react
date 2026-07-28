import type { ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { ExpressionCell } from '../cells/ExpressionCell';
import { useRowActions } from '../hooks/useRowActions';
import { GenericRow } from './GenericRow';

export interface OptimisationVariableRowProps {
  row: BoxedRowData;
}

/** One decision variable (a Typed Input Wrapper) — draggable, `Duplicate`/`Delete`. */
export function OptimisationVariableRow({ row }: OptimisationVariableRowProps): ReactElement {
  const actions = useRowActions(row);
  return (
    <GenericRow
      row={row}
      name={row.name}
      value={<ExpressionCell row={row} />}
      valueIsInteractive
      depth={row.depth}
      actions={actions}
    />
  );
}
