import type { ReactElement } from 'react';
import Chip from '@mui/material/Chip';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import type { BoxedRenderNode } from '../boxed-model';
import { isObject } from '../boxed-model';
import { useFieldActions } from '../BoxedEditorProvider';

export function BoxHeader({
  node,
  label = node.name ?? (node.path === '*' ? 'Model' : node.path),
  editable = false,
}: {
  node: BoxedRenderNode;
  label?: string;
  editable?: boolean;
}): ReactElement {
  const fields = useFieldActions();
  const annotation =
    isObject(node.authored) && typeof node.authored['@node'] === 'string'
      ? node.authored['@node']
      : undefined;
  const annotationName =
    isObject(node.authored) && typeof node.authored['@node-name'] === 'string'
      ? node.authored['@node-name']
      : undefined;
  const description =
    isObject(node.authored) && typeof node.authored['@description'] === 'string'
      ? node.authored['@description']
      : undefined;
  return (
    <>
      {editable && fields.editingPath === node.path ? (
        <InputBase
          autoFocus
          value={fields.nameDraft}
          inputProps={{ 'aria-label': `Name ${node.path}` }}
          onChange={(event) => fields.setNameDraft(event.target.value)}
          onBlur={() => fields.commitRename(node)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') fields.commitRename(node);
            if (event.key === 'Escape') fields.setNameDraft(node.name ?? '');
          }}
        />
      ) : (
        label
      )}
      {annotation && (
        <Chip
          size="small"
          sx={{ ml: 0.5 }}
          label={
            annotationName ? `${annotation}: ${annotationName}` : annotation
          }
        />
      )}
      {description && (
        <Typography
          variant="caption"
          sx={{ display: 'block' }}
          color="text.secondary"
        >
          {description}
        </Typography>
      )}
    </>
  );
}
