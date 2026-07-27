import AccountTreeIcon from '@mui/icons-material/AccountTree';
import type { ReactElement } from 'react';
import type { BoxedRowData } from '../boxed-editor-types';
import { GenericRow } from './GenericRow';

export interface ModelHeaderRowProps {
  row: BoxedRowData;
}

/** Root row: model name. Fixed position, not sortable, not deletable. */
export function ModelHeaderRow({ row }: ModelHeaderRowProps): ReactElement {
  return (
    <GenericRow
      name={row.name}
      depth={0}
      tall
      occupiesNameAndValue
      strong
      showDragHandle={false}
      icon={<AccountTreeIcon sx={{ fontSize: 20, color: '#fff' }} />}
      iconBgColor="#17191c"
    />
  );
}
