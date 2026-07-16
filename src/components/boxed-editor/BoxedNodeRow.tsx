import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import type { PortableNode } from '@edgerules/portable';
import { CodeEditorCell } from '../code-editor-cell';
import { highlightEdgeRules } from '../code-editor/language/highlight';
import { expressionEmbedContext } from './boxed-embed';
import { isObject, type BoxedRenderNode } from './boxed-model';
import type { BoxedEditorTargetKind, BoxedNodeRowProps } from './boxed-editor-types';
import { expressionText, functionSignature, invocationText, typeLabel } from './boxed-editor-utils';

function HighlightedExpression({ node }: { node: PortableNode }): ReactElement {
  const text = expressionText(node);
  const spans = useMemo(() => highlightEdgeRules(text), [text]);
  return <Box component="code" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
    {spans.map((span, index) => span.className ? <span key={`${span.text}-${index}`} className={span.className}>{span.text}</span> : span.text)}
  </Box>;
}

function ChildRows({ node, props, depth }: { node: BoxedRenderNode; props: BoxedNodeRowProps; depth: number }): ReactElement {
  const [scrollTop, setScrollTop] = useState(0);
  const children = node.children ?? [];
  const childProps = (child: BoxedRenderNode): BoxedRenderNode => ({
    ...child,
    parentListLength: children.length,
    parentListTerminal: node.list?.terminal,
  });

  if (children.length <= 100 || !node.list) {
    return <>{children.map(child => <BoxedNodeRow key={child.id} {...props} node={childProps(child)} depth={depth} />)}</>;
  }

  const rowHeight = 42;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 4);
  const end = Math.min(children.length, start + 18);
  return <Box aria-label={`Virtualized rows ${node.path}`} onScroll={event => setScrollTop(event.currentTarget.scrollTop)} sx={{ maxHeight: 420, overflowY: 'auto' }}>
    <Box sx={{ height: children.length * rowHeight, position: 'relative' }}>
      <Box sx={{ position: 'absolute', inset: '0 auto auto 0', width: '100%', transform: `translateY(${start * rowHeight}px)` }}>
        {children.slice(start, end).map(child => <BoxedNodeRow key={child.id} {...props} node={childProps(child)} depth={depth} />)}
      </Box>
    </Box>
  </Box>;
}

function BoxedValueCell(props: BoxedNodeRowProps): ReactNode {
  const { node, readOnly, snapshot, languageService, editingExpression, commitExpression, cancelExpression, openInput, openSignature, onOpenNode } = props;
  if (node.kind === 'context') return node.children?.length ? null : <Typography color="text.secondary">Empty context</Typography>;
  if (node.kind === 'list' || node.kind === 'relation') return <Typography color="text.secondary">{node.kind === 'relation' ? `${node.list?.loaded ?? 0} relation rows` : `${node.list?.loaded ?? 0} list items`}</Typography>;
  if (node.kind === 'input' && isObject(node.authored)) return <Button size="small" color="inherit" disabled={readOnly} onClick={() => openInput(node)}><Typography component="code">&lt;{String(node.authored.type)}{node.authored.required ? ', required' : ''}&gt;</Typography></Button>;
  if (node.kind === 'external-function' && isObject(node.authored)) return <Button size="small" color="inherit" disabled={readOnly} onClick={() => openSignature(node)}><Typography component="code">{functionSignature(node.authored, node.name).replace(/^func /, 'external func ')}</Typography></Button>;
  if (node.kind === 'function') return null;
  if (node.kind === 'editor-link') {
    const kind = (isObject(node.authored) ? node.authored['@kind'] : undefined) as BoxedEditorTargetKind;
    const text = kind === 'type-definition' ? 'Open Types Editor' : kind === 'ruleset' ? 'Open Decision Table Editor' : 'Open Loop Editor';
    return onOpenNode ? <Button size="small" onClick={() => onOpenNode({ path: node.path, kind })}>{text}</Button> : <Typography color="text.secondary">{text}</Typography>;
  }

  const value = node.kind === 'invocation' && isObject(node.authored) ? invocationText(node.authored) : node.authored;
  if (editingExpression === node.path) {
    return <CodeEditorCell value={expressionText(value)} service={languageService} embedContext={expressionEmbedContext(snapshot, node.path)} autoFocus onCommit={(text) => commitExpression(node, text)} onCancel={cancelExpression} />;
  }
  return <Box sx={{ minHeight: 24 }}><HighlightedExpression node={value} /></Box>;
}

function BoxedActionsCell({ props }: { props: BoxedNodeRowProps }): ReactElement {
  const { node, startName, duplicate, remove, openAdd, openSignature, openMetadata, openInvocation, openListItem, duplicateListItem, removeListItem, moveListItem, openColumn } = props;
  const canFieldActions = node.path !== '*' && !node.listItem && node.kind !== 'editor-link' && node.kind !== 'function' && node.kind !== 'external-function';
  return <Box role="cell" sx={{ py: 0.5, display: 'flex', gap: 0.25 }}>
    {node.kind === 'context' && !node.listItem && <IconButton size="small" aria-label={`Add field to ${node.path}`} onClick={() => openAdd(node.path)}><AddIcon fontSize="small" /></IconButton>}
    {(node.kind === 'list' || node.kind === 'relation') && node.list?.terminal && <IconButton size="small" aria-label={`Add ${node.kind === 'relation' ? 'row' : 'item'} to ${node.path}`} onClick={() => openListItem(node)}><AddIcon fontSize="small" /></IconButton>}
    {node.kind === 'relation' && node.list?.terminal && <Button size="small" aria-label={`Add column to ${node.path}`} onClick={() => openColumn(node, 'add')}>Column</Button>}
    {node.listItem && <>
      <IconButton size="small" aria-label={`Delete ${node.path}`} onClick={() => removeListItem(node)}><DeleteIcon fontSize="small" /></IconButton>
      {node.parentListTerminal && <>
        <IconButton size="small" aria-label={`Duplicate ${node.path}`} onClick={() => duplicateListItem(node)}><ContentCopyIcon fontSize="small" /></IconButton>
        {node.listItem.index > 0 && <IconButton size="small" aria-label={`Move ${node.path} up`} onClick={() => moveListItem(node, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>}
        {node.listItem.index + 1 < (node.parentListLength ?? 0) && <IconButton size="small" aria-label={`Move ${node.path} down`} onClick={() => moveListItem(node, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>}
      </>}
    </>}
    {(node.kind === 'function' || node.kind === 'external-function') && <Button size="small" aria-label={`Edit signature ${node.path}`} onClick={() => openSignature(node)}>Signature</Button>}
    {node.kind === 'invocation' && <Button size="small" aria-label={`Edit invocation ${node.path}`} onClick={() => openInvocation(node)}>Invocation</Button>}
    {isObject(node.authored) && node.path !== '*' && <Button size="small" aria-label={`Edit metadata ${node.path}`} onClick={() => openMetadata(node)}>Metadata</Button>}
    {canFieldActions && <>
      <IconButton size="small" aria-label={`Rename ${node.path}`} onClick={() => startName(node)}><DriveFileRenameOutlineIcon fontSize="small" /></IconButton>
      <IconButton size="small" aria-label={`Duplicate ${node.path}`} onClick={() => duplicate(node)}><ContentCopyIcon fontSize="small" /></IconButton>
      <IconButton size="small" aria-label={`Delete ${node.path}`} onClick={() => remove(node)}><DeleteIcon fontSize="small" /></IconButton>
    </>}
  </Box>;
}

export function BoxedNodeRow(props: BoxedNodeRowProps): ReactElement {
  const { node, depth, expanded, editingExpression, editingName, nameDraft, readOnly, errors, toggle, startExpression, setNameDraft, commitName, loadMore, openColumn } = props;
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expanded.has(node.id);
  const label = node.kind === 'function' && isObject(node.authored) ? functionSignature(node.authored, node.name) : node.name ?? (node.path === '*' ? 'Model' : node.path);
  const annotation = isObject(node.authored) && typeof node.authored['@node'] === 'string' ? node.authored['@node'] : undefined;
  const annotationName = isObject(node.authored) && typeof node.authored['@node-name'] === 'string' ? node.authored['@node-name'] : undefined;
  const description = isObject(node.authored) && typeof node.authored['@description'] === 'string' ? node.authored['@description'] : undefined;
  const editableExpression = node.kind === 'expression';
  const isEditingExpression = editingExpression === node.path;

  return <>
    <Box role="row" aria-label={node.path} aria-level={depth + 1} sx={{ display: 'grid', gridTemplateColumns: readOnly ? '34px minmax(140px, 0.35fr) minmax(200px, 1fr) minmax(100px, 0.2fr)' : '34px minmax(140px, 0.35fr) minmax(200px, 1fr) minmax(100px, 0.2fr) 118px', alignItems: 'start', borderTop: '1px solid', borderColor: 'divider', minHeight: 42 }}>
      <Box role="cell" sx={{ pl: depth * 2 }}>
        {hasChildren && <IconButton size="small" aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.path}`} aria-expanded={isExpanded} onClick={() => toggle(node.id)}>{isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>}
      </Box>
      <Box role="cell" sx={{ py: 1, pr: 1, fontWeight: node.path === '*' ? 700 : 500 }}>
        {editingName === node.path
          ? <InputBase autoFocus value={nameDraft} inputProps={{ 'aria-label': `Name ${node.path}` }} onChange={event => setNameDraft(event.target.value)} onBlur={() => commitName(node)} onKeyDown={event => { if (event.key === 'Enter') commitName(node); if (event.key === 'Escape') setNameDraft(node.name ?? ''); }} />
          : label}
        {annotation && <Chip size="small" sx={{ ml: 0.5 }} label={annotationName ? `${annotation}: ${annotationName}` : annotation} />}
        {description && <Typography variant="caption" sx={{ display: 'block' }} color="text.secondary">{description}</Typography>}
      </Box>
      <Box role="cell" tabIndex={!readOnly && editableExpression && !isEditingExpression ? 0 : undefined} onClick={!readOnly && editableExpression && !isEditingExpression ? () => startExpression(node) : undefined} onKeyDown={!readOnly && editableExpression && !isEditingExpression ? event => { if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startExpression(node); } } : undefined} sx={{ py: 1, pr: 1, cursor: !readOnly && editableExpression ? 'cell' : 'default', outline: 'none' }}>
        <BoxedValueCell {...props} />
        {errors[node.path] && <Alert severity="error" sx={{ mt: 0.5, py: 0 }}>{errors[node.path]}</Alert>}
      </Box>
      <Box role="cell" sx={{ py: 1 }}>{typeLabel(node.schema) && <Chip size="small" label={typeLabel(node.schema)} />}</Box>
      {!readOnly && <BoxedActionsCell props={props} />}
    </Box>
    {node.kind === 'relation' && hasChildren && isExpanded && <Box role="row" aria-label={`${node.path}.columns`} sx={{ display: 'flex', gap: 2, pl: (depth + 2) * 2, py: 0.5, bgcolor: 'action.hover' }}>{isObject(node.children?.[0].authored) && Object.keys(node.children[0].authored).filter(column => !column.startsWith('@')).map(column => <Typography key={column} role="columnheader" variant="caption">{column}</Typography>)}</Box>}
    {hasChildren && isExpanded && <ChildRows node={node} props={props} depth={depth + 1} />}
    {(node.kind === 'list' || node.kind === 'relation') && isExpanded && <Box sx={{ pl: (depth + 1) * 2, py: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
      {node.list?.error && <Alert severity="error">{node.list.error}</Alert>}
      {!node.list?.terminal && <Button size="small" onClick={() => loadMore(node)}>Load more</Button>}
      {node.kind === 'relation' && node.list?.terminal && node.children?.[0] && isObject(node.children[0].authored) && <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>{Object.keys(node.children[0].authored).filter(key => !key.startsWith('@')).map(column => <Box key={column}><Button size="small" aria-label={`Rename column ${node.path}.${column}`} onClick={() => openColumn(node, 'rename', column)}>Rename {column}</Button><IconButton size="small" aria-label={`Delete column ${node.path}.${column}`} onClick={() => openColumn(node, 'delete', column)}><DeleteIcon fontSize="small" /></IconButton></Box>)}</Box>}
    </Box>}
  </>;
}
