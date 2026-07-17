import type { ReactElement } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import IconButton from '@mui/material/IconButton';
import type { BoxedRenderNode } from '../boxed-model';
import { useFieldActions } from '../BoxedEditorProvider';

export function FieldActions({
  node,
}: {
  node: BoxedRenderNode;
}): ReactElement {
  const actions = useFieldActions();
  return (
    <>
      <IconButton
        size="small"
        aria-label={`Rename ${node.path}`}
        onClick={() => actions.startRename(node)}
      >
        <DriveFileRenameOutlineIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        aria-label={`Duplicate ${node.path}`}
        onClick={() => actions.duplicate(node)}
      >
        <ContentCopyIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        aria-label={`Delete ${node.path}`}
        onClick={() => actions.remove(node)}
      >
        <DeleteIcon fontSize="small" />
      </IconButton>
    </>
  );
}
