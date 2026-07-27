import type { ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { GenericRow } from './GenericRow';

export interface FieldRowProps {
  row: BoxedRowData;
}

/** The one generic leaf row — class field, typed input, or plain computed expression. */
export function FieldRow({ row }: FieldRowProps): ReactElement {
  return <GenericRow name={row.name} value={row.value} type={row.type} depth={row.depth} />;
}
