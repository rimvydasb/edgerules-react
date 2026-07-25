import { Children, type ReactElement, type ReactNode } from 'react';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoxedRenderNode } from '../boxed-model';
import { useBoxedEditorState } from '../BoxedEditorProvider';

interface BoxFrameProps {
  node: BoxedRenderNode;
  depth: number;
  header: ReactNode;
  value?: ReactNode;
  type?: ReactNode;
  actions?: ReactNode;
  actionsWidth?: number | string;
  headerSpan?: boolean;
  children?: ReactNode;
  valueProps?: {
    tabIndex?: number;
    onClick?: () => void;
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    cursor?: string;
  };
}

export function BoxFrame({
  node,
  depth,
  header,
  value,
  type,
  actions,
  actionsWidth = 118,
  headerSpan = false,
  children,
  valueProps,
}: BoxFrameProps): ReactElement {
  const { readOnly, expanded, errors, toggle } = useBoxedEditorState();
  const hasChildren = Children.count(children) > 0;
  const isExpanded = expanded.has(node.id);
  const sortable = useSortable({
    id: node.id,
    data: { reorder: node.sortable },
    disabled: readOnly || !node.sortable,
  });
  return (
    <>
      <Box
        ref={sortable.setNodeRef}
        role="row"
        aria-label={node.path}
        aria-level={depth + 1}
        sx={{
          display: 'grid',
          gridTemplateColumns: `34px 34px minmax(180px, 0.38fr) minmax(240px, 1fr) minmax(110px, 0.22fr) ${typeof actionsWidth === 'number' ? `${actionsWidth}px` : actionsWidth}`,
          alignItems: 'stretch',
          borderTop: '1px solid',
          borderColor: 'divider',
          minHeight: 40,
          position: 'relative',
          zIndex: sortable.isDragging ? 1 : 'auto',
          opacity: sortable.isDragging ? 0.72 : 1,
          transform: CSS.Transform.toString(sortable.transform),
          transition: sortable.transition,
          bgcolor: sortable.isDragging ? 'background.paper' : undefined,
          '& > [role="cell"]': {
            minWidth: 0,
            borderLeft: '1px solid',
            borderColor: 'divider',
          },
          '& > [role="cell"]:first-of-type': { borderLeft: 0 },
        }}
      >
        <Box
          role="cell"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {node.sortable && (
            <IconButton
              size="small"
              aria-label={`Drag ${node.path}`}
              disabled={readOnly}
              sx={{
                cursor: readOnly
                  ? 'default'
                  : sortable.isDragging
                    ? 'grabbing'
                    : 'grab',
                touchAction: 'none',
              }}
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <DragIndicatorIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
        <Box
          role="cell"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {hasChildren && (
            <IconButton
              size="small"
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.path}`}
              aria-expanded={isExpanded}
              onClick={() => toggle(node.id)}
            >
              {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          )}
        </Box>
        <Box
          role="cell"
          sx={{
            gridColumn: headerSpan ? '3 / 6' : undefined,
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            py: 0.75,
            pl: depth * 2 + 1,
            pr: 1,
            fontFamily: 'monospace',
            fontWeight: node.path === '*' ? 700 : 500,
            '& > *': { minWidth: 0 },
          }}
        >
          {headerSpan ? (
            <Box sx={{ width: '100%', minWidth: 0 }}>
              {header}
              {errors[node.path] && (
                <Alert severity="error" sx={{ mt: 0.5, py: 0 }}>
                  {errors[node.path]}
                </Alert>
              )}
            </Box>
          ) : (
            header
          )}
        </Box>
        {!headerSpan && (
          <>
            <Box
              role="cell"
              tabIndex={valueProps?.tabIndex}
              onClick={valueProps?.onClick}
              onKeyDown={valueProps?.onKeyDown}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                overflow: 'hidden',
                py: 0.75,
                px: 1,
                cursor: valueProps?.cursor ?? 'default',
                outline: 'none',
              }}
            >
              {value}
              {errors[node.path] && (
                <Alert severity="error" sx={{ mt: 0.5, py: 0 }}>
                  {errors[node.path]}
                </Alert>
              )}
            </Box>
            <Box
              role="cell"
              sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5 }}
            >
              {type}
            </Box>
          </>
        )}
        <Box
          role="cell"
          sx={{
            gridColumn: 6,
            py: 0.25,
            px: 0.25,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 0.25,
          }}
        >
          {!readOnly && actions}
        </Box>
      </Box>
      {hasChildren && isExpanded && children}
    </>
  );
}
