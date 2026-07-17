import type { ReactElement } from 'react';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';
import type { BoxedRenderNode } from '../boxed-model';
import { useListActions } from '../BoxedEditorProvider';

export function ListItemActions({ node }: { node: BoxedRenderNode }): ReactElement {
  const actions = useListActions();
  const item = node.listItem;
  return <>
    <IconButton size="small" aria-label={`Delete ${node.path}`} onClick={() => actions.removeItem(node)}><DeleteIcon fontSize="small" /></IconButton>
    {node.parentListTerminal && item && <>
      <IconButton size="small" aria-label={`Duplicate ${node.path}`} onClick={() => actions.duplicateItem(node)}><ContentCopyIcon fontSize="small" /></IconButton>
      {item.index > 0 && <IconButton size="small" aria-label={`Move ${node.path} up`} onClick={() => actions.moveItem(node, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>}
      {item.index + 1 < (node.parentListLength ?? 0) && <IconButton size="small" aria-label={`Move ${node.path} down`} onClick={() => actions.moveItem(node, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>}
    </>}
  </>;
}
