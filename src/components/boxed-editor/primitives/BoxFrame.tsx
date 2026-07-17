import { Children, type ReactElement, type ReactNode } from 'react';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { CodeEditorCell } from '../../code-editor-cell';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoxedRenderNode } from '../boxed-model';
import { metadataEmbedContext } from '../boxed-embed';
import {
  useBoxedEditorState,
  useMetadataActions,
} from '../BoxedEditorProvider';
import { metadataText } from '../boxed-editor-utils';

interface BoxFrameProps {
  node: BoxedRenderNode;
  depth: number;
  header: ReactNode;
  value?: ReactNode;
  type?: ReactNode;
  actions?: ReactNode;
  actionsWidth?: number | string;
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
  children,
  valueProps,
}: BoxFrameProps): ReactElement {
  const { readOnly, expanded, errors, toggle } = useBoxedEditorState();
  const state = useBoxedEditorState();
  const metadata = useMetadataActions();
  const editingMetadata = metadata.activePath === node.path;
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
          gridTemplateColumns: readOnly
            ? '34px minmax(140px, 0.35fr) minmax(200px, 1fr) minmax(100px, 0.2fr)'
            : `34px 34px minmax(140px, 0.35fr) minmax(200px, 1fr) minmax(100px, 0.2fr) ${typeof actionsWidth === 'number' ? `${actionsWidth}px` : actionsWidth}`,
          alignItems: 'start',
          borderTop: '1px solid',
          borderColor: 'divider',
          minHeight: 42,
          position: 'relative',
          zIndex: sortable.isDragging ? 1 : 'auto',
          opacity: sortable.isDragging ? 0.72 : 1,
          transform: CSS.Transform.toString(sortable.transform),
          transition: sortable.transition,
          bgcolor: sortable.isDragging ? 'background.paper' : undefined,
          // Indent the complete row so nested contexts remain visually grouped.
          // Padding only the disclosure cell leaves every field name on the
          // same vertical line because that cell has a fixed 34px width.
          pl: depth * 2,
        }}
      >
        {!readOnly && (
          <Box role="cell">
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
          </Box>
        )}
        <Box role="cell">
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
          sx={{ py: 1, pr: 1, fontWeight: node.path === '*' ? 700 : 500 }}
        >
          {header}
        </Box>
        <Box
          role="cell"
          tabIndex={valueProps?.tabIndex}
          onClick={valueProps?.onClick}
          onKeyDown={valueProps?.onKeyDown}
          sx={{
            py: 1,
            pr: 1,
            cursor: valueProps?.cursor ?? 'default',
            outline: 'none',
          }}
        >
          {editingMetadata ? (
            <CodeEditorCell
              value={metadataText(node.authored)}
              service={state.languageService}
              embedContext={metadataEmbedContext(state.snapshot, node.path)}
              autoFocus
              placeholder='@NodeKind(name: "Label")'
              onCommit={(text) => metadata.commit(node, text)}
              onCancel={metadata.cancel}
            />
          ) : (
            value
          )}
          {errors[node.path] && (
            <Alert severity="error" sx={{ mt: 0.5, py: 0 }}>
              {errors[node.path]}
            </Alert>
          )}
        </Box>
        <Box role="cell" sx={{ py: 1 }}>
          {type}
        </Box>
        {!readOnly && (
          <Box role="cell" sx={{ py: 0.5, display: 'flex', gap: 0.25 }}>
            {actions}
          </Box>
        )}
      </Box>
      {hasChildren && isExpanded && children}
    </>
  );
}
