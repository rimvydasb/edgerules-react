import { Fragment, type ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { SettingRow } from '../primitives';
import { NewRow } from './NewRow';
import { OptimisationVariableRow } from './OptimisationVariableRow';

export interface OptimisationVariableGroupRowProps {
  row: BoxedRowData;
}

/** Fixed `variables:` section header — `Add Variable`, not draggable. */
export function OptimisationVariableGroupRow({
  row,
}: OptimisationVariableGroupRowProps): ReactElement {
  return (
    <Fragment>
      <SettingRow name={row.name} depth={row.depth} occupiesNameAndValue showActions />
      {row.children?.map((child) => (
        <OptimisationVariableRow key={child.path} row={child} />
      ))}
      <NewRow row={row} />
    </Fragment>
  );
}
