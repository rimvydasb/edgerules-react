import type { ReactElement } from 'react';
import { ExpressionCell } from '../cells/ExpressionCell';
import type { BoxedRowData } from '../boxed-editor-types';
import { useRowActions } from '../hooks/useRowActions';
import { GenericRow } from './GenericRow';

export interface ListItemRowProps {
  row: BoxedRowData;
}

/** One scalar element of a `list` — its DSL literal is edited the same way a `field` value is. */
export function ListItemRow({ row }: ListItemRowProps): ReactElement {
  const actions = useRowActions(row);
  return (
    <GenericRow
      name={row.name}
      value={<ExpressionCell row={row} />}
      valueIsInteractive
      depth={row.depth}
      actions={actions}
    />
  );
}
