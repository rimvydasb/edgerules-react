import { Fragment, type ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { GenericRow } from './GenericRow';
import { NewRow } from './NewRow';
import { RowSwitch } from './RowSwitch';

export interface ListRowProps {
  row: BoxedRowData;
}

/** Header of a homogeneous scalar list; items are appended below via the trailing placeholder. */
export function ListRow({ row }: ListRowProps): ReactElement {
  return (
    <Fragment>
      <GenericRow
        name={row.name}
        type={row.type}
        depth={row.depth}
        occupiesNameAndValue
        strong
      />
      {row.children?.map((child) => (
        <RowSwitch key={child.path} row={child} />
      ))}
      <NewRow row={row} />
    </Fragment>
  );
}
