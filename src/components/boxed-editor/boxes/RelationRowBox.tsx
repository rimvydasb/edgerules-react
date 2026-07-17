import type { ReactElement } from 'react';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
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
  useExpressionActions,
} from '../BoxedEditorProvider';
import { cellCode } from '../cell-code';
import { StaticExpression } from '../primitives/StaticExpression';

export function RelationRowBox({
  node,
  columns,
}: {
  node: BoxedRenderNode;
  columns: RelationColumnRenderNode[];
}): ReactElement {
  const state = useBoxedEditorState();
  const expression = useExpressionActions();
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
        const editable = cell && cell.kind !== 'context';
        return (
          <TableCell
            key={column.id}
            aria-label={cell?.path ?? `${node.path}.${column.name}`}
            title={cell ? cellCode(cell.authored) : undefined}
            tabIndex={!state.readOnly && editable && !editing ? 0 : undefined}
            onClick={
              !state.readOnly && editable && !editing
                ? () => expression.activate(cell)
                : undefined
            }
            onKeyDown={
              !state.readOnly && editable && !editing
                ? (event) => {
                    if (event.key === 'Enter' || event.key === 'F2') {
                      event.preventDefault();
                      expression.activate(cell);
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
              cursor: !state.readOnly && editable ? 'cell' : 'default',
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
              <CodeEditorCell
                value={cellCode(cell.authored)}
                service={state.languageService}
                embedContext={expressionEmbedContext(state.snapshot, cell.path)}
                autoFocus
                onCommit={(text) => expression.commit(cell, text)}
                onCancel={expression.cancel}
              />
            ) : cell ? (
              <StaticExpression value={cell.authored} />
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
