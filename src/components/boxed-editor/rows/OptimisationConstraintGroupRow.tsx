import { Fragment, type ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { SettingRow } from '../primitives';
import { NewRow } from './NewRow';
import { OptimisationConstraintRow } from './OptimisationConstraintRow';

export interface OptimisationConstraintGroupRowProps {
  row: BoxedRowData;
}

/** Fixed `constraints:` section header — `Add Constraint`, not draggable. */
export function OptimisationConstraintGroupRow({
  row,
}: OptimisationConstraintGroupRowProps): ReactElement {
  return (
    <Fragment>
      <SettingRow name={row.name} depth={row.depth} occupiesNameAndValue showActions />
      {row.children?.map((child) => (
        <OptimisationConstraintRow key={child.path} row={child} />
      ))}
      <NewRow row={row} />
    </Fragment>
  );
}
