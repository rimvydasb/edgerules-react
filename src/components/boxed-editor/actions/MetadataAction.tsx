import type { ReactElement } from 'react';
import Button from '@mui/material/Button';
import type { BoxedRenderNode } from '../boxed-model';
import { useMetadataActions } from '../BoxedEditorProvider';

export function MetadataAction({
  node,
}: {
  node: BoxedRenderNode;
}): ReactElement {
  const actions = useMetadataActions();
  return (
    <Button
      size="small"
      aria-label={`Edit metadata ${node.path}`}
      onClick={() => actions.activate(node)}
    >
      {actions.activePath === node.path ? 'Editing metadata' : 'Metadata'}
    </Button>
  );
}
