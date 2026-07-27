import ClassIcon from '@mui/icons-material/Class';
import { Fragment, type ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { useBoxedEditorUi } from '../context/BoxedEditorUiContext';
import { GenericRow } from './GenericRow';
import { NewRow } from './NewRow';
import { RowSwitch } from './RowSwitch';

export interface ComplexTypeRowProps {
  row: BoxedRowData;
}

/** Named, reusable type definition containing `field` rows. */
export function ComplexTypeRow({ row }: ComplexTypeRowProps): ReactElement {
  const { isExpanded } = useBoxedEditorUi();
  const expanded = isExpanded(row.path);

  return (
    <Fragment>
      <GenericRow
        name={row.name}
        depth={row.depth}
        occupiesNameAndValue
        strong
        iconActsAsDragHandle
        icon={<ClassIcon sx={{ fontSize: 19, color: '#fff' }} />}
        iconBgColor="#ed6c02"
      />
      {expanded && (
        <Fragment>
          {row.children?.map((child) => (
            <RowSwitch key={child.path} row={child} />
          ))}
          <NewRow row={row} />
        </Fragment>
      )}
    </Fragment>
  );
}
