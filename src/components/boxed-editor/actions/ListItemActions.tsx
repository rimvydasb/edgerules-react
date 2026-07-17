import type { ReactElement } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';
import type { BoxedRenderNode } from '../boxed-model';
import { useListActions } from '../BoxedEditorProvider';

export function ListItemActions({
  node,
}: {
  node: BoxedRenderNode;
}): ReactElement {
  const actions = useListActions();
  return (
    <>
      <IconButton
        size="small"
        aria-label={`Delete ${node.path}`}
        onClick={() => actions.removeItem(node)}
      >
        <DeleteIcon fontSize="small" />
      </IconButton>
      {node.parentListTerminal && node.listItem && (
        <IconButton
          size="small"
          aria-label={`Duplicate ${node.path}`}
          onClick={() => actions.duplicateItem(node)}
        >
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      )}
    </>
  );
}
