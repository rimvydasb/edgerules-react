import FunctionsIcon from '@mui/icons-material/Functions';
import { Fragment, type ReactElement } from 'react';
import type { BoxedRowData, BoxedTableRowData } from '../boxed-editor-types';
import { useBoxedEditorUi } from '../context/BoxedEditorUiContext';
import { useRowActions } from '../hooks/useRowActions';
import { ArgumentHeaders } from '../primitives';
import { FunctionResultRow } from './FunctionResultRow';
import { GenericRow } from './GenericRow';
import { NewRow } from './NewRow';
import { RowSwitch } from './RowSwitch';

export interface FunctionRowProps {
  row: BoxedTableRowData;
}

/** Named callable (`func`) — tall header row with its argument headers, then its body rows. */
export function FunctionRow({ row }: FunctionRowProps): ReactElement {
  const { isExpanded } = useBoxedEditorUi();
  const expanded = isExpanded(row.path);
  const actions = useRowActions(row);

  return (
    <Fragment>
      <GenericRow
        name={row.name}
        type={row.type}
        depth={row.depth}
        tall
        strong
        iconActsAsDragHandle
        icon={<FunctionsIcon sx={{ fontSize: 19, color: '#fff' }} />}
        iconBgColor="#1976d2"
        value={<ArgumentHeaders arguments={row.parameters ?? []} />}
        valueIsInteractive
        actions={actions}
      />
      {expanded && (
        <Fragment>
          {row.children?.map((child) => renderChild(child, row))}
          <NewRow row={row} />
        </Fragment>
      )}
    </Fragment>
  );
}

function renderChild(child: BoxedRowData, functionRow: BoxedTableRowData): ReactElement {
  if (child.kind === 'function-result') {
    return <FunctionResultRow key={child.path} row={child} functionRow={functionRow} />;
  }
  return <RowSwitch key={child.path} row={child} />;
}
