import { useState, type ReactElement } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { CSS } from '@dnd-kit/utilities';
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { FieldActions } from '../actions/FieldActions';
import type {
  RelationColumnRenderNode,
  RelationRenderNode,
} from '../boxed-model';
import {
  useBoxedEditorState,
  useListActions,
  useRelationActions,
} from '../BoxedEditorProvider';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';
import { RelationRowBox } from './RelationRowBox';

function RelationColumnHeader({
  node,
  column,
}: {
  node: RelationRenderNode;
  column: RelationColumnRenderNode;
}): ReactElement {
  const state = useBoxedEditorState();
  const relation = useRelationActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.name);
  const sortable = useSortable({
    id: column.id,
    data: { reorder: column.sortable },
    disabled: state.readOnly || !node.list.terminal,
  });
  const commit = (): void => {
    setEditing(false);
    relation.renameColumn(node, column.name, draft);
  };

  return (
    <TableCell
      ref={sortable.setNodeRef}
      component="th"
      scope="col"
      sx={{
        minWidth: 150,
        px: 1,
        py: 0.75,
        bgcolor: 'action.hover',
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.72 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        {node.list.terminal && (
          <IconButton
            size="small"
            aria-label={`Drag column ${node.path}.${column.name}`}
            disabled={state.readOnly}
            sx={{
              // Offset the IconButton's internal padding so the glyph shares
              // the same left edge as values in the body cells below it.
              ml: -1.25,
              cursor: state.readOnly ? 'default' : 'grab',
              touchAction: 'none',
            }}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
        )}
        {editing ? (
          <InputBase
            autoFocus
            value={draft}
            inputProps={{
              'aria-label': `Column name ${node.path}.${column.name}`,
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setDraft(column.name);
                setEditing(false);
              }
            }}
            sx={{ minWidth: 0, flex: 1, fontWeight: 700 }}
          />
        ) : (
          <Button
            color="inherit"
            size="small"
            disabled={state.readOnly || !node.list.terminal}
            aria-label={`Edit column name ${node.path}.${column.name}`}
            onClick={() => setEditing(true)}
            sx={{
              minWidth: 0,
              flex: 1,
              justifyContent: 'flex-start',
              px: 0.5,
              fontWeight: 700,
              textTransform: 'none',
            }}
          >
            {column.name}
          </Button>
        )}
        {!state.readOnly && node.list.terminal && (
          <IconButton
            size="small"
            aria-label={`Delete column ${node.path}.${column.name}`}
            onClick={() => relation.editColumn(node, 'delete', column.name)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </TableCell>
  );
}

export function RelationBox({
  node,
  depth,
}: {
  node: RelationRenderNode;
  depth: number;
}): ReactElement {
  const state = useBoxedEditorState();
  const list = useListActions();
  const relation = useRelationActions();
  const children = node.children ?? [];

  return (
    <BoxFrame
      node={node}
      depth={depth}
      header={<BoxHeader node={node} editable />}
      type={<BoxTypeChip schema={node.schema} />}
      actionsWidth={172}
      actions={
        <>
          {node.list.terminal && (
            <IconButton
              size="small"
              aria-label={`Add row to ${node.path}`}
              onClick={() => list.addItem(node)}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          )}
          <FieldActions node={node} showRename={false} />
        </>
      }
    >
      {node.columns.length > 0 ? (
        <TableContainer
          sx={{
            ml: (depth + 1) * 2,
            width: (theme) => `calc(100% - ${theme.spacing((depth + 1) * 2)})`,
            borderTop: '1px solid',
            borderColor: 'divider',
            overflowX: 'auto',
          }}
        >
          <Table
            size="small"
            aria-label={`${node.path} relationship`}
            sx={{ tableLayout: 'auto', minWidth: 'max-content' }}
          >
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{ width: 42, bgcolor: 'action.hover' }}
                  aria-label="Row ordering"
                />
                <SortableContext
                  items={node.columns.map((column) => column.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {node.columns.map((column) => (
                    <RelationColumnHeader
                      key={column.id}
                      node={node}
                      column={column}
                    />
                  ))}
                </SortableContext>
                {!state.readOnly && (
                  <TableCell
                    align="right"
                    sx={{ width: 82, bgcolor: 'action.hover' }}
                  >
                    {node.list.terminal && (
                      <IconButton
                        size="small"
                        aria-label={`Add column to ${node.path}`}
                        onClick={() => relation.editColumn(node, 'add')}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <SortableContext
              items={children.map((child) => child.id)}
              strategy={verticalListSortingStrategy}
            >
              <TableBody>
                {children.map((child) => (
                  <RelationRowBox
                    key={child.id}
                    node={{ ...child, parentListTerminal: node.list.terminal }}
                    columns={node.columns}
                  />
                ))}
              </TableBody>
            </SortableContext>
          </Table>
        </TableContainer>
      ) : (
        <Typography sx={{ px: 2, py: 1 }} color="text.secondary">
          No relationship columns discovered
        </Typography>
      )}
      {(node.list.error || !node.list.terminal) && (
        <Box
          sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}
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
