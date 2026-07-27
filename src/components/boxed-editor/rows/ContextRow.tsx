import { Fragment, type ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { useBoxedEditorUi } from '../context/BoxedEditorUiContext';
import { GenericRow } from './GenericRow';
import { RowSwitch } from './RowSwitch';

export interface ContextRowProps {
  row: BoxedRowData;
}

/** Named nested object that can contain other rows. */
export function ContextRow({ row }: ContextRowProps): ReactElement {
  const { isExpanded } = useBoxedEditorUi();
  const expanded = isExpanded(row.path);

  return (
    <Fragment>
      <GenericRow name={row.name} depth={row.depth} occupiesNameAndValue strong />
      {expanded &&
        row.children?.map((child) => <RowSwitch key={child.path} row={child} />)}
    </Fragment>
  );
}
