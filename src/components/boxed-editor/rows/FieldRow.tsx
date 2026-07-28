import type { ReactElement } from 'react';
import { ExpressionCell } from '../cells/ExpressionCell';
import type { BoxedRowData } from '../boxed-editor-types';
import { useRowActions } from '../hooks/useRowActions';
import { GenericRow } from './GenericRow';

export interface FieldRowProps {
  row: BoxedRowData;
}

/** The one generic leaf row — class field, typed input, or plain computed expression. */
export function FieldRow({ row }: FieldRowProps): ReactElement {
  const actions = useRowActions(row);
  return (
    <GenericRow
      row={row}
      name={row.name}
      value={<ExpressionCell row={row} />}
      valueIsInteractive
      type={row.type}
      depth={row.depth}
      actions={actions}
    />
  );
}
