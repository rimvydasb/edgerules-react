import type { ReactElement } from 'react';
import AddIcon from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { FieldActions } from '../actions/FieldActions';
import type { BoxedRenderNode, ListRenderNode } from '../boxed-model';
import { useListActions } from '../BoxedEditorProvider';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';
import { CollectionChildren } from '../primitives/CollectionChildren';
import { ListItemBox } from './ListItemBox';

export function ListBox({
  node,
  depth,
}: {
  node: ListRenderNode;
  depth: number;
}): ReactElement {
  const list = useListActions();
  const children = node.children ?? [];
  const renderItem = (child: BoxedRenderNode): ReactElement => {
    const item = {
      ...child,
      parentListTerminal: node.list.terminal,
    } as BoxedRenderNode;
    return <ListItemBox key={child.id} node={item} depth={depth + 1} />;
  };
  return (
    <BoxFrame
      node={node}
      depth={depth}
      header={<BoxHeader node={node} editable />}
      value={
        <Typography color="text.secondary">
          {node.list.loaded} list items
        </Typography>
      }
      type={<BoxTypeChip schema={node.schema} />}
      actions={
        <>
          {node.list.terminal && (
            <IconButton
              size="small"
              aria-label={`Add item to ${node.path}`}
              onClick={() => list.addItem(node)}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          )}
          <FieldActions node={node} showRename={false} />
        </>
      }
    >
      <CollectionChildren
        path={node.path}
        children={children}
        renderItem={renderItem}
      />
      {(node.list.error || !node.list.terminal) && (
        <Box
          sx={{
            pl: (depth + 1) * 2,
            py: 0.5,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          {node.list.error && <Alert severity="error">{node.list.error}</Alert>}
          {!node.list.terminal && (
            <Button size="small" onClick={() => list.loadMore(node)}>
              Load more
            </Button>
          )}
        </Box>
      )}
    </BoxFrame>
  );
}
