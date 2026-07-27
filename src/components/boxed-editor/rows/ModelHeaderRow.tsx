import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { Fragment, type ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { useRowActions } from '../hooks/useRowActions';
import { GenericRow } from './GenericRow';
import { ModelSettingsDialog } from './ModelSettingsDialog';

export interface ModelHeaderRowProps {
  row: BoxedRowData;
}

/** Root row: model name. Fixed position, not sortable, not deletable. */
export function ModelHeaderRow({ row }: ModelHeaderRowProps): ReactElement {
  const actions = useRowActions(row);
  return (
    <Fragment>
      <GenericRow
        name={row.name}
        depth={0}
        tall
        occupiesNameAndValue
        strong
        showDragHandle={false}
        icon={<AccountTreeIcon sx={{ fontSize: 20, color: '#fff' }} />}
        iconBgColor="#17191c"
        actions={actions}
      />
      <ModelSettingsDialog row={row} />
    </Fragment>
  );
}
