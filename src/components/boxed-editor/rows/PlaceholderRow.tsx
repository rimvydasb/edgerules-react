import type { ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { GenericRow } from './GenericRow';

export interface PlaceholderRowProps {
  row: BoxedRowData;
}

/** Stand-in for the 17 `BoxedRowKind`s not yet implemented — filled in by Phases 3–4. */
export function PlaceholderRow({ row }: PlaceholderRowProps): ReactElement {
  return (
    <GenericRow
      name={row.name}
      value={`${row.kind} — not yet implemented`}
      depth={row.depth}
      placeholder
    />
  );
}
