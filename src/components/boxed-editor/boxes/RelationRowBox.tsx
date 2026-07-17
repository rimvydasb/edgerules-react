import { Fragment, type ReactElement } from 'react';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import { CodeEditorCell } from '../../code-editor-cell';
import { ListItemActions } from '../actions/ListItemActions';
import { expressionEmbedContext } from '../boxed-embed';
import type { BoxedRenderNode, RelationColumnRenderNode } from '../boxed-model';
import {
  useBoxedEditorState,
  useBoxedNodeRenderer,
  useExpressionActions,
} from '../BoxedEditorProvider';
import { cellCode } from '../cell-code';

export function RelationRowBox({
  node,
  columns,
}: {
  node: BoxedRenderNode;
  columns: RelationColumnRenderNode[];
}): ReactElement {
  const state = useBoxedEditorState();
  const expression = useExpressionActions();
  const BoxedNode = useBoxedNodeRenderer();
  const sortable = useSortable({
    id: node.id,
    data: { reorder: node.sortable },
    disabled: state.readOnly || !node.sortable,
  });

  return (
    <TableRow
      ref={sortable.setNodeRef}
      aria-label={node.path}
      sx={{
        opacity: sortable.isDragging ? 0.72 : 1,
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        bgcolor: sortable.isDragging ? 'background.paper' : undefined,
        '&:last-child td': { borderBottom: 0 },
      }}
    >
      {!state.readOnly && (
        <TableCell padding="checkbox" sx={{ width: 42 }}>
          {node.sortable && (
            <IconButton
              size="small"
              aria-label={`Drag ${node.path}`}
              sx={{
                cursor: sortable.isDragging ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <DragIndicatorIcon fontSize="small" />
            </IconButton>
          )}
        </TableCell>
      )}
      {columns.map((column) => {
        const cell = node.children?.find((child) => child.name === column.name);
        const editing = cell && expression.activePath === cell.path;
        const drillable = Boolean(cell?.children?.length);
        const expanded = Boolean(cell && state.expanded.has(cell.id));
        const editable = cell && !drillable;
        const cellError = cell ? state.errors[cell.path] : undefined;
        return (
          <TableCell
            key={column.id}
            aria-label={cell?.path ?? `${node.path}.${column.name}`}
            title={
              drillable
                ? cell?.name
                : cell
                  ? cellCode(cell.authored)
                  : undefined
            }
            tabIndex={
              (drillable || (!state.readOnly && editable)) && !editing
                ? 0
                : undefined
            }
            aria-expanded={drillable ? expanded : undefined}
            onClick={
              drillable
                ? () => state.toggle(cell!.id)
                : !state.readOnly && editable && !editing
                  ? () => expression.activate(cell)
                  : undefined
            }
            onKeyDown={
              (drillable || (!state.readOnly && editable)) && !editing
                ? (event) => {
                    if (event.key === 'Enter' || event.key === 'F2') {
                      event.preventDefault();
                      if (drillable) state.toggle(cell!.id);
                      else expression.activate(cell!);
                    }
                  }
                : undefined
            }
            sx={{
              minWidth: 150,
              maxWidth: 320,
              px: 1.5,
              py: 1,
              verticalAlign: 'middle',
              cursor: drillable
                ? 'pointer'
                : !state.readOnly && editable
                  ? 'cell'
                  : 'default',
              overflow: 'hidden',
              '& code': {
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
          >
            {editing ? (
              <Fragment>
                <CodeEditorCell
                  value={cellCode(cell.authored)}
                  service={state.languageService}
                  embedContext={expressionEmbedContext(
                    state.snapshot,
                    cell.path,
                  )}
                  autoFocus
                  onCommit={(text) => expression.commit(cell, text)}
                  onCancel={expression.cancel}
                />
                {cellError && (
                  <Alert severity="error" sx={{ mt: 0.5, py: 0 }}>
                    {cellError}
                  </Alert>
                )}
              </Fragment>
            ) : cell ? (
              <Fragment>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}
                >
                  {drillable &&
                    (expanded ? (
                      <ExpandLessIcon
                        fontSize="small"
                        sx={{ mr: 0.5, flex: '0 0 auto' }}
                      />
                    ) : (
                      <ExpandMoreIcon
                        fontSize="small"
                        sx={{ mr: 0.5, flex: '0 0 auto' }}
                      />
                    ))}
                  {drillable ? (
                    <Box sx={{ minWidth: 0, fontWeight: 600 }}>
                      {cell.name ?? column.name}
                    </Box>
                  ) : (
                    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                      {cellCode(cell.authored)}
                    </Box>
                  )}
                </Box>
                {drillable && expanded && (
                  <Box
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    sx={{
                      mt: 1,
                      overflow: 'hidden',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      bgcolor: 'background.paper',
                    }}
                  >
                    {cell.children?.map((child) => (
                      <BoxedNode
                        key={child.id}
                        node={child}
                        depth={0}
                        suppressMetadata
                      />
                    ))}
                  </Box>
                )}
              </Fragment>
            ) : (
              '—'
            )}
          </TableCell>
        );
      })}
      {!state.readOnly && (
        <TableCell align="right" sx={{ width: 82, whiteSpace: 'nowrap' }}>
          <ListItemActions node={node} />
        </TableCell>
      )}
    </TableRow>
  );
}
