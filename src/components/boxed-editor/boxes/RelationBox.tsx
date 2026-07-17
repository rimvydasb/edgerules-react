import type { ReactElement } from 'react';
import AddIcon from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { FieldActions } from '../actions/FieldActions';
import { MetadataAction } from '../actions/MetadataAction';
import { RelationColumnActions } from '../actions/RelationColumnActions';
import { isObject, type BoxedRenderNode, type RelationRenderNode } from '../boxed-model';
import { useListActions, useRelationActions } from '../BoxedEditorProvider';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';
import { CollectionChildren } from '../primitives/CollectionChildren';
import { RelationRowBox } from './RelationRowBox';

export function RelationBox({ node, depth }: { node: RelationRenderNode; depth: number }): ReactElement {
  const list = useListActions();
  const relation = useRelationActions();
  const children = node.children ?? [];
  const columns = children[0] && isObject(children[0].authored) ? Object.keys(children[0].authored).filter(key => !key.startsWith('@')) : [];
  const renderRow = (child: BoxedRenderNode): ReactElement => {
    const row = { ...child, parentListLength: children.length, parentListTerminal: node.list.terminal } as BoxedRenderNode;
    return <RelationRowBox key={child.id} node={row} depth={depth + 1} />;
  };
  return <BoxFrame node={node} depth={depth} header={<BoxHeader node={node} editable />} value={<Typography color="text.secondary">{node.list.loaded} relation rows</Typography>} type={<BoxTypeChip schema={node.schema} />}
    actions={<>{node.list.terminal && <><IconButton size="small" aria-label={`Add row to ${node.path}`} onClick={() => list.addItem(node)}><AddIcon fontSize="small" /></IconButton><Button size="small" aria-label={`Add column to ${node.path}`} onClick={() => relation.editColumn(node, 'add')}>Column</Button></>}<MetadataAction node={node} /><FieldActions node={node} /></>}
  >
    {columns.length > 0 && <Box role="row" aria-label={`${node.path}.columns`} sx={{ display: 'flex', gap: 2, pl: (depth + 2) * 2, py: 0.5, bgcolor: 'action.hover' }}>{columns.map(column => <Typography key={column} role="columnheader" variant="caption">{column}</Typography>)}</Box>}
    <CollectionChildren path={node.path} children={children} renderItem={renderRow} />
    <Box sx={{ pl: (depth + 1) * 2, py: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
      {node.list.error && <Alert severity="error">{node.list.error}</Alert>}
      {!node.list.terminal && <Button size="small" onClick={() => list.loadMore(node)}>Load more</Button>}
      {node.list.terminal && <RelationColumnActions node={node} columns={columns} />}
    </Box>
  </BoxFrame>;
}
