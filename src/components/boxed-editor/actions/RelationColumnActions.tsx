import type { ReactElement } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import type { RelationRenderNode } from '../boxed-model';
import { useRelationActions } from '../BoxedEditorProvider';

export function RelationColumnActions({
  node,
  columns,
}: {
  node: RelationRenderNode;
  columns: string[];
}): ReactElement {
  const actions = useRelationActions();
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
      {columns.map((column) => (
        <Box key={column}>
          <Button
            size="small"
            aria-label={`Rename column ${node.path}.${column}`}
            onClick={() => actions.editColumn(node, 'rename', column)}
          >
            Rename {column}
          </Button>
          <IconButton
            size="small"
            aria-label={`Delete column ${node.path}.${column}`}
            onClick={() => actions.editColumn(node, 'delete', column)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
}
