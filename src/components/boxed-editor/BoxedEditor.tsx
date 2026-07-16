import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { type SxProps, type Theme } from '@mui/material/styles';
import type { PortableError, PortableNode, PortableRootContext, PortableTypedValue } from '@edgerules/portable';
import type { GetFilter } from '@edgerules/web';
import { CodeEditorCell } from '../code-editor-cell';
import { highlightEdgeRules } from '../code-editor/language/highlight';
import type { CodeEditorService } from '../code-editor/language/service';
import { isPortableError } from '../../lib/portable';
import { expressionEmbedContext } from './boxed-embed';
import { isObject, renderNode, resolveAuthoredPath, type BoxedRenderNode, type IndexedListPage } from './boxed-model';

export interface BoxedEditorService {
  toPortable(): PortableRootContext;
  get(path: string, filter?: GetFilter): PortableNode | PortableError;
  set(path: string, node: PortableNode): PortableNode | PortableError;
  remove(path: string): void | PortableError;
  rename(path: string, newName: string): void | PortableError;
}
export type BoxedEditorTargetKind = 'type-definition' | 'ruleset' | 'loop';
export interface BoxedEditorOpenTarget { path: string; kind: BoxedEditorTargetKind }
export interface BoxedEditorProps {
  service: BoxedEditorService;
  path: string;
  languageService?: CodeEditorService;
  revision?: string | number;
  readOnly?: boolean;
  onChange?: (snapshot: PortableRootContext) => void;
  onOpenNode?: (target: BoxedEditorOpenTarget) => void;
  className?: string;
  sx?: SxProps<Theme>;
}

const NOOP_LANGUAGE_SERVICE: CodeEditorService = { diagnostics: () => [] };

interface AddFieldDraft { parentPath: string; name: string; kind: 'expression' | 'input' | 'context' | 'list' }
interface InputDraft { path: string; value: PortableTypedValue }
interface SignatureParameter { name: string; type: string }
interface SignatureDraft { path: string; external: boolean; parameters: SignatureParameter[]; returnType: string; node: Record<string, unknown> }
interface MetadataDraft { path: string; node: Record<string, unknown>; nodeKind: string; nodeName: string; description: string }
interface InvocationDraft { path: string; node: Record<string, unknown>; method: string; named: boolean; arguments: Array<{ name: string; value: string }> }
interface ListItemDraft { path: string; relation: boolean; fields: Array<{ name: string; value: string }> }
interface RelationColumnDraft { path: string; items: PortableNode[]; action: 'add' | 'rename' | 'delete'; source?: string; name: string; value: string }

const LIST_PAGE_SIZE = 50;

function typeLabel(schema: PortableNode | undefined): string | undefined {
  if (!isObject(schema)) return undefined;
  const type = schema.type ?? schema['@type'];
  if (typeof type !== 'string') return undefined;
  const direction = schema.readOnly === true ? 'computed' : schema.writeOnly === true ? 'input' : undefined;
  return direction ? `${type} · ${direction}` : type;
}

function expressionText(node: PortableNode): string {
  if (isObject(node) && String(node['@kind']) === 'expression') return String(node.expression ?? '');
  if (typeof node === 'string') return node;
  return JSON.stringify(node);
}

function invocationText(node: Record<string, unknown>): string {
  const method = String(node['@method'] ?? '');
  const argumentsValue = node['@arguments'];
  if (Array.isArray(argumentsValue)) return `${method}(${argumentsValue.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(', ')})`;
  if (isObject(argumentsValue)) return `${method}(${Object.entries(argumentsValue).map(([name, value]) => `${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join(', ')})`;
  return `${method}()`;
}

function HighlightedExpression({ node }: { node: PortableNode }): ReactElement {
  const text = expressionText(node);
  const spans = useMemo(() => highlightEdgeRules(text), [text]);
  return <Box component="code" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
    {spans.map((span, index) => span.className ? <span key={`${span.text}-${index}`} className={span.className}>{span.text}</span> : span.text)}
  </Box>;
}

function functionSignature(node: Record<string, unknown>, name: string | undefined): string {
  const parameters = isObject(node['@parameters']) ? Object.entries(node['@parameters']).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : (isObject(value) && typeof value.type === 'string' ? value.type : 'any')}`).join(', ') : '';
  const result = node['@return'];
  const returnType = typeof result === 'string' ? result : (isObject(result) && typeof result.type === 'string' ? result.type : '');
  return `func ${name ?? ''}(${parameters})${returnType ? ` → ${returnType}` : ''}`;
}

function parameterDrafts(node: Record<string, unknown>): SignatureParameter[] {
  return isObject(node['@parameters'])
    ? Object.entries(node['@parameters']).map(([name, value]) => ({ name, type: value === null ? '' : typeText(value) }))
    : [];
}

function typeText(value: unknown): string {
  return typeof value === 'string' ? value : isObject(value) && typeof value.type === 'string' ? value.type : '';
}

function signatureNode(draft: SignatureDraft): PortableNode {
  const parameters: Record<string, string | null> = {};
  for (const parameter of draft.parameters) {
    if (parameter.name.trim()) parameters[parameter.name.trim()] = parameter.type.trim() || null;
  }
  const { node, returnType, external } = draft;
  return {
    ...node,
    '@kind': external ? 'external-function' : 'function',
    '@parameters': parameters,
    ...(returnType.trim() ? { '@return': returnType.trim() } : {}),
  } as PortableNode;
}

function metadataNode(draft: MetadataDraft): PortableNode {
  const { node, nodeKind, nodeName, description } = draft;
  const { '@node': _node, '@node-name': _nodeName, '@description': _description, ...rest } = node;
  return {
    ...rest,
    ...(nodeKind.trim() ? { '@node': nodeKind.trim(), ...(nodeName.trim() ? { '@node-name': nodeName.trim() } : {}) } : {}),
    ...(description.trim() ? { '@description': description.trim() } : {}),
  } as PortableNode;
}

function invocationNode(draft: InvocationDraft): PortableNode {
  const { node, method, named, arguments: draftArguments } = draft;
  const argumentsValue = named
    ? Object.fromEntries(draftArguments.filter(argument => argument.name.trim()).map(argument => [argument.name.trim(), argument.value]))
    : draftArguments.map(argument => argument.value);
  const { '@type': _type, ...authored } = node;
  return { ...authored, '@kind': 'invocation', '@method': method.trim(), '@arguments': argumentsValue } as PortableNode;
}

function parentPath(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot === -1 ? '*' : path.slice(0, lastDot);
}

function childPath(parent: string, name: string): string { return parent === '*' ? name : `${parent}.${name}`; }

function typedInput(node: PortableNode): PortableTypedValue {
  const value = isObject(node) ? node : {};
  const { readOnly: _readOnly, writeOnly: _writeOnly, type, required, default: defaultValue, enum: enumValue, items, ...metadata } = value;
  return {
    ...metadata,
    '@kind': 'type',
    type: typeof type === 'string' ? type : 'string',
    ...(required === true ? { required: true } : {}),
    ...(defaultValue !== undefined ? { default: defaultValue as PortableTypedValue['default'] } : {}),
    ...(Array.isArray(enumValue) && enumValue.length ? { enum: enumValue as PortableTypedValue['enum'] } : {}),
    ...(items !== undefined ? { items: items as PortableTypedValue['items'] } : {}),
  };
}

function schemaChild(schema: PortableNode | undefined, name: string): PortableNode | undefined {
  return isObject(schema) && name in schema ? schema[name] as PortableNode : undefined;
}

function indexedLists(
  service: BoxedEditorService,
  authored: PortableNode,
  rootPath: string,
  schema: PortableNode | undefined,
  pageSizes: ReadonlyMap<string, number>,
): Map<string, IndexedListPage> {
  const pages = new Map<string, IndexedListPage>();
  const visit = (node: PortableNode, nodePath: string, nodeSchema: PortableNode | undefined): void => {
    if (isObject(nodeSchema) && nodeSchema.type === 'array') {
      const items: PortableNode[] = [];
      const count = pageSizes.get(nodePath) ?? LIST_PAGE_SIZE;
      let terminal = false;
      let error: string | undefined;
      for (let index = 0; index < count; index += 1) {
        const item = service.get(`${nodePath}[${index}]`, 'FIELDS');
        if (isPortableError(item)) {
          if (item.type === 'EntryNotFound') terminal = true;
          else error = item.message;
          break;
        }
        items.push(item);
      }
      if (items.length || error) {
        pages.set(nodePath, { items, terminal, ...(error ? { error } : {}) });
        const itemSchema = nodeSchema.items as PortableNode | undefined;
        items.forEach((item, index) => visit(item, `${nodePath}[${index}]`, itemSchema));
      }
      return;
    }
    if (isObject(node) && (node['@kind'] === 'context' || node['@kind'] === undefined)) {
      Object.entries(node).forEach(([name, child]) => {
        if (!name.startsWith('@')) visit(child as PortableNode, nodePath === '*' ? name : `${nodePath}.${name}`, schemaChild(nodeSchema, name));
      });
    }
  };
  visit(authored, rootPath, schema);
  return pages;
}

function findNode(node: BoxedRenderNode, path: string): BoxedRenderNode | undefined {
  if (node.path === path) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return undefined;
}

interface NodeRowProps {
  node: BoxedRenderNode;
  depth: number;
  expanded: Set<string>;
  editingExpression: string | null;
  editingName: string | null;
  nameDraft: string;
  readOnly: boolean;
  snapshot: PortableRootContext;
  languageService: CodeEditorService;
  errors: Record<string, string>;
  toggle: (id: string) => void;
  startExpression: (node: BoxedRenderNode) => void;
  commitExpression: (node: BoxedRenderNode, text: string) => void;
  cancelExpression: () => void;
  startName: (node: BoxedRenderNode) => void;
  setNameDraft: (value: string) => void;
  commitName: (node: BoxedRenderNode) => void;
  duplicate: (node: BoxedRenderNode) => void;
  remove: (node: BoxedRenderNode) => void;
  openInput: (node: BoxedRenderNode) => void;
  openAdd: (path: string) => void;
  openSignature: (node: BoxedRenderNode) => void;
  openMetadata: (node: BoxedRenderNode) => void;
  openInvocation: (node: BoxedRenderNode) => void;
  openListItem: (node: BoxedRenderNode) => void;
  duplicateListItem: (node: BoxedRenderNode) => void;
  removeListItem: (node: BoxedRenderNode) => void;
  moveListItem: (node: BoxedRenderNode, direction: -1 | 1) => void;
  loadMore: (node: BoxedRenderNode) => void;
  openColumn: (node: BoxedRenderNode, action: 'add' | 'rename' | 'delete', source?: string) => void;
  onOpenNode?: (target: BoxedEditorOpenTarget) => void;
}

function ChildRows({ node, props, depth }: { node: BoxedRenderNode; props: NodeRowProps; depth: number }): ReactElement {
  const [scrollTop, setScrollTop] = useState(0);
  const children = node.children ?? [];
  if (children.length <= 100 || !node.list) return <>{children.map(child => <NodeRow key={child.id} {...props} node={{ ...child, parentListLength: children.length, parentListTerminal: node.list?.terminal }} depth={depth} />)}</>;
  const rowHeight = 42;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 4);
  const end = Math.min(children.length, start + 18);
  return <Box aria-label={`Virtualized rows ${node.path}`} onScroll={event => setScrollTop(event.currentTarget.scrollTop)} sx={{ maxHeight: 420, overflowY: 'auto' }}>
    <Box sx={{ height: children.length * rowHeight, position: 'relative' }}>
      <Box sx={{ position: 'absolute', inset: '0 auto auto 0', width: '100%', transform: `translateY(${start * rowHeight}px)` }}>
        {children.slice(start, end).map(child => <NodeRow key={child.id} {...props} node={{ ...child, parentListLength: children.length, parentListTerminal: node.list?.terminal }} depth={depth} />)}
      </Box>
    </Box>
  </Box>;
}

function NodeRow(props: NodeRowProps): ReactElement {
  const { node, depth, expanded, editingExpression, editingName, nameDraft, readOnly, snapshot, languageService, errors, toggle, startExpression, commitExpression, cancelExpression, startName, setNameDraft, commitName, duplicate, remove, openInput, openAdd, openSignature, openMetadata, openInvocation, openListItem, duplicateListItem, removeListItem, moveListItem, loadMore, openColumn, onOpenNode } = props;
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expanded.has(node.id);
  const label = node.kind === 'function' && isObject(node.authored) ? functionSignature(node.authored, node.name) : node.name ?? (node.path === '*' ? 'Model' : node.path);
  const annotation = isObject(node.authored) && typeof node.authored['@node'] === 'string' ? node.authored['@node'] : undefined;
  const annotationName = isObject(node.authored) && typeof node.authored['@node-name'] === 'string' ? node.authored['@node-name'] : undefined;
  const description = isObject(node.authored) && typeof node.authored['@description'] === 'string' ? node.authored['@description'] : undefined;
  const schemaType = typeLabel(node.schema);
  const targetKind = isObject(node.authored) ? node.authored['@kind'] : undefined;
  const editableExpression = node.kind === 'expression';
  const isEditingExpression = editingExpression === node.path;
  const canFieldActions = node.path !== '*' && !node.listItem && node.kind !== 'editor-link' && node.kind !== 'function' && node.kind !== 'external-function';
  let value: ReactNode;
  if (node.kind === 'context') value = node.children?.length ? null : <Typography color="text.secondary">Empty context</Typography>;
  else if (node.kind === 'list' || node.kind === 'relation') value = <Typography color="text.secondary">{node.kind === 'relation' ? `${node.list?.loaded ?? 0} relation rows` : `${node.list?.loaded ?? 0} list items`}</Typography>;
  else if (node.kind === 'input' && isObject(node.authored)) value = <Button size="small" color="inherit" disabled={readOnly} onClick={() => openInput(node)}><Typography component="code">&lt;{String(node.authored.type)}{node.authored.required ? ', required' : ''}&gt;</Typography></Button>;
  else if (node.kind === 'external-function' && isObject(node.authored)) value = <Button size="small" color="inherit" disabled={readOnly} onClick={() => openSignature(node)}><Typography component="code">{functionSignature(node.authored, node.name).replace(/^func /, 'external func ')}</Typography></Button>;
  else if (node.kind === 'function') value = null;
  else if (node.kind === 'editor-link') {
    const kind = targetKind as BoxedEditorTargetKind;
    const text = kind === 'type-definition' ? 'Open Types Editor' : kind === 'ruleset' ? 'Open Decision Table Editor' : 'Open Loop Editor';
    value = onOpenNode ? <Button size="small" onClick={() => onOpenNode({ path: node.path, kind })}>{text}</Button> : <Typography color="text.secondary">{text}</Typography>;
  } else if (isEditingExpression) {
    value = <CodeEditorCell value={expressionText(node.kind === 'invocation' && isObject(node.authored) ? invocationText(node.authored) : node.authored)} service={languageService} embedContext={expressionEmbedContext(snapshot, node.path)} autoFocus onCommit={(text) => commitExpression(node, text)} onCancel={cancelExpression} />;
  } else {
    value = <Box sx={{ minHeight: 24 }}><HighlightedExpression node={node.kind === 'invocation' && isObject(node.authored) ? invocationText(node.authored) : node.authored} /></Box>;
  }
  return <>
    <Box role="row" aria-label={node.path} aria-level={depth + 1} sx={{ display: 'grid', gridTemplateColumns: readOnly ? '34px minmax(140px, 0.35fr) minmax(200px, 1fr) minmax(100px, 0.2fr)' : '34px minmax(140px, 0.35fr) minmax(200px, 1fr) minmax(100px, 0.2fr) 118px', alignItems: 'start', borderTop: '1px solid', borderColor: 'divider', minHeight: 42 }}>
      <Box role="cell" sx={{ pl: depth * 2 }}>
        {hasChildren && <IconButton size="small" aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.path}`} aria-expanded={isExpanded} onClick={() => toggle(node.id)}>{isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>}
      </Box>
      <Box role="cell" sx={{ py: 1, pr: 1, fontWeight: node.path === '*' ? 700 : 500 }}>
        {editingName === node.path ? <InputBase autoFocus value={nameDraft} inputProps={{ 'aria-label': `Name ${node.path}` }} onChange={event => setNameDraft(event.target.value)} onBlur={() => commitName(node)} onKeyDown={event => { if (event.key === 'Enter') commitName(node); if (event.key === 'Escape') setNameDraft(node.name ?? ''); }} /> : label}
        {annotation && <Chip size="small" sx={{ ml: 0.5 }} label={annotationName ? `${annotation}: ${annotationName}` : annotation} />}
        {description && <Typography variant="caption" sx={{ display: 'block' }} color="text.secondary">{description}</Typography>}
      </Box>
      <Box role="cell" tabIndex={!readOnly && editableExpression && !isEditingExpression ? 0 : undefined} onClick={!readOnly && editableExpression && !isEditingExpression ? () => startExpression(node) : undefined} onKeyDown={!readOnly && editableExpression && !isEditingExpression ? event => { if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startExpression(node); } } : undefined} sx={{ py: 1, pr: 1, cursor: !readOnly && editableExpression ? 'cell' : 'default', outline: 'none' }}>{value}{errors[node.path] && <Alert severity="error" sx={{ mt: 0.5, py: 0 }}>{errors[node.path]}</Alert>}</Box>
      <Box role="cell" sx={{ py: 1 }}>{schemaType && <Chip size="small" label={schemaType} />}</Box>
      {!readOnly && <Box role="cell" sx={{ py: 0.5, display: 'flex', gap: 0.25 }}>
        {node.kind === 'context' && !node.listItem && <IconButton size="small" aria-label={`Add field to ${node.path}`} onClick={() => openAdd(node.path)}><AddIcon fontSize="small" /></IconButton>}
        {(node.kind === 'list' || node.kind === 'relation') && node.list?.terminal && <IconButton size="small" aria-label={`Add ${node.kind === 'relation' ? 'row' : 'item'} to ${node.path}`} onClick={() => openListItem(node)}><AddIcon fontSize="small" /></IconButton>}
        {node.kind === 'relation' && node.list?.terminal && <Button size="small" aria-label={`Add column to ${node.path}`} onClick={() => openColumn(node, 'add')}>Column</Button>}
        {node.listItem && <><IconButton size="small" aria-label={`Delete ${node.path}`} onClick={() => removeListItem(node)}><DeleteIcon fontSize="small" /></IconButton>{node.parentListTerminal && <><IconButton size="small" aria-label={`Duplicate ${node.path}`} onClick={() => duplicateListItem(node)}><ContentCopyIcon fontSize="small" /></IconButton>{node.listItem.index > 0 && <IconButton size="small" aria-label={`Move ${node.path} up`} onClick={() => moveListItem(node, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>}{node.listItem.index + 1 < (node.parentListLength ?? 0) && <IconButton size="small" aria-label={`Move ${node.path} down`} onClick={() => moveListItem(node, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>}</>}</>}
        {(node.kind === 'function' || node.kind === 'external-function') && <Button size="small" aria-label={`Edit signature ${node.path}`} onClick={() => openSignature(node)}>Signature</Button>}
        {node.kind === 'invocation' && <Button size="small" aria-label={`Edit invocation ${node.path}`} onClick={() => openInvocation(node)}>Invocation</Button>}
        {isObject(node.authored) && node.path !== '*' && <Button size="small" aria-label={`Edit metadata ${node.path}`} onClick={() => openMetadata(node)}>Metadata</Button>}
        {canFieldActions && <><IconButton size="small" aria-label={`Rename ${node.path}`} onClick={() => startName(node)}><DriveFileRenameOutlineIcon fontSize="small" /></IconButton><IconButton size="small" aria-label={`Duplicate ${node.path}`} onClick={() => duplicate(node)}><ContentCopyIcon fontSize="small" /></IconButton><IconButton size="small" aria-label={`Delete ${node.path}`} onClick={() => remove(node)}><DeleteIcon fontSize="small" /></IconButton></>}
      </Box>}
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

export function BoxedEditor({ service, path, languageService, revision, readOnly = false, onChange, onOpenNode, className, sx }: BoxedEditorProps): ReactElement {
  const [model, setModel] = useState<BoxedRenderNode | null>(null);
  const [snapshot, setSnapshot] = useState<PortableRootContext | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingExpression, setEditingExpression] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [addDraft, setAddDraft] = useState<AddFieldDraft | null>(null);
  const [inputDraft, setInputDraft] = useState<InputDraft | null>(null);
  const [signatureDraft, setSignatureDraft] = useState<SignatureDraft | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft | null>(null);
  const [invocationDraft, setInvocationDraft] = useState<InvocationDraft | null>(null);
  const [listItemDraft, setListItemDraft] = useState<ListItemDraft | null>(null);
  const [columnDraft, setColumnDraft] = useState<RelationColumnDraft | null>(null);
  const pageSizes = useRef(new Map<string, number>());

  const load = useCallback((nextSnapshot: PortableRootContext, resetExpansion: boolean): boolean => {
    const selected = resolveAuthoredPath(nextSnapshot, path);
    if (!selected) { setFatalError(`Path not found: ${path}`); setModel(null); return false; }
    const schema = service.get(path, 'FIELDS');
    if (isPortableError(schema)) { setFatalError(schema.message); setModel(null); return false; }
    if (isObject(selected) && String(selected['@kind']) === 'function') {
      const definition = service.get(`${path}.*`, 'FUNCTION_DEFINITIONS');
      if (isPortableError(definition)) { setFatalError(definition.message); setModel(null); return false; }
    }
    const selectedName = path === '*' ? undefined : path.split('.').at(-1)?.replace(/\[\d+\]$/, '');
    const next = renderNode(selected, path, schema, selectedName, indexedLists(service, selected, path, schema, pageSizes.current));
    setSnapshot(nextSnapshot); setModel(next); setFatalError(null);
    if (resetExpansion) setExpanded(new Set([next.id, ...(path !== '*' ? next.children?.map(child => child.id) ?? [] : [])]));
    return true;
  }, [path, service]);

  useEffect(() => { try { load(service.toPortable(), true); } catch (cause) { setFatalError(cause instanceof Error ? cause.message : String(cause)); } }, [service, path, revision, load]);

  const refreshCommitted = useCallback((): boolean => {
    const nextSnapshot = service.toPortable();
    if (!load(nextSnapshot, false)) return false;
    onChange?.(nextSnapshot);
    setErrors({}); setEditingExpression(null); setEditingName(null);
    return true;
  }, [load, onChange, service]);
  const showError = useCallback((targetPath: string, error: PortableError | string): void => setErrors(previous => ({ ...previous, [targetPath]: typeof error === 'string' ? error : error.message })), []);
  const toggle = useCallback((id: string): void => setExpanded(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }), []);
  const commitExpression = useCallback((node: BoxedRenderNode, text: string): void => {
    let targetPath = node.path;
    let nextNode: PortableNode = text;
    if (node.invocation) {
      const invocation = snapshot && resolveAuthoredPath(snapshot, node.invocation.path);
      if (!isObject(invocation)) { setFatalError(`Invocation not found: ${node.invocation.path}`); return; }
      const argumentsValue = invocation['@arguments'];
      if (typeof node.invocation.argument === 'number' && Array.isArray(argumentsValue)) {
        const argumentsCopy = [...argumentsValue]; argumentsCopy[node.invocation.argument] = text;
        nextNode = { ...invocation, '@arguments': argumentsCopy } as PortableNode;
      } else if (typeof node.invocation.argument === 'string' && isObject(argumentsValue)) {
        nextNode = { ...invocation, '@arguments': { ...argumentsValue, [node.invocation.argument]: text } } as PortableNode;
      } else { setFatalError(`Invocation argument not found: ${node.path}`); return; }
      targetPath = node.invocation.path;
    }
    const result = service.set(targetPath, nextNode);
    if (isPortableError(result)) { showError(node.path, result); return; }
    refreshCommitted();
  }, [refreshCommitted, service, showError, snapshot]);
  const guardedRename = useCallback((node: BoxedRenderNode, newName: string): void => {
    const oldName = node.name ?? '';
    if (!newName || newName === oldName) { setEditingName(null); return; }
    const renamed = service.rename(node.path, newName);
    if (isPortableError(renamed)) { showError(node.path, renamed); return; }
    const ownerPath = parentPath(node.path);
    const validation = service.get(ownerPath, 'FIELDS');
    if (!isPortableError(validation)) { refreshCommitted(); return; }
    const rollback = service.rename(childPath(ownerPath, newName), oldName);
    if (isPortableError(rollback)) { setFatalError(`Could not restore ${node.path}: ${rollback.message}`); return; }
    showError(node.path, validation);
  }, [refreshCommitted, service, showError]);
  const guardedRemove = useCallback((node: BoxedRenderNode): void => {
    const removed = service.remove(node.path);
    if (isPortableError(removed)) { showError(node.path, removed); return; }
    const validation = service.get(parentPath(node.path), 'FIELDS');
    if (!isPortableError(validation)) { refreshCommitted(); return; }
    const restored = service.set(node.path, node.authored);
    if (isPortableError(restored)) { setFatalError(`Could not restore ${node.path}: ${restored.message}`); return; }
    showError(node.path, validation);
  }, [refreshCommitted, service, showError]);
  const duplicate = useCallback((node: BoxedRenderNode): void => {
    const parent = parentPath(node.path); const base = node.name ?? 'copy';
    const fields = snapshot && resolveAuthoredPath(snapshot, parent);
    let name = `${base}Copy`; let index = 2;
    while (isObject(fields) && name in fields) { name = `${base}Copy${index}`; index += 1; }
    const result = service.set(childPath(parent, name), node.authored);
    if (isPortableError(result)) { showError(node.path, result); return; }
    refreshCommitted();
  }, [refreshCommitted, service, showError, snapshot]);
  const commitAdd = useCallback((): void => {
    if (!addDraft || !addDraft.name.trim()) return;
    const target = childPath(addDraft.parentPath, addDraft.name.trim());
    const node: PortableNode = addDraft.kind === 'expression' ? '0' : addDraft.kind === 'input' ? { '@kind': 'type', type: 'string' } : addDraft.kind === 'context' ? { '@kind': 'context' } : [];
    const result = service.set(target, node);
    if (isPortableError(result)) { showError(target, result); return; }
    setAddDraft(null); refreshCommitted();
  }, [addDraft, refreshCommitted, service, showError]);
  const commitInput = useCallback((): void => {
    if (!inputDraft) return;
    const result = service.set(inputDraft.path, typedInput(inputDraft.value));
    if (isPortableError(result)) { showError(inputDraft.path, result); return; }
    setInputDraft(null); refreshCommitted();
  }, [inputDraft, refreshCommitted, service, showError]);
  const commitSignature = useCallback((): void => {
    if (!signatureDraft) return;
    const result = service.set(signatureDraft.path, signatureNode(signatureDraft));
    if (isPortableError(result)) { showError(signatureDraft.path, result); return; }
    setSignatureDraft(null); refreshCommitted();
  }, [refreshCommitted, service, showError, signatureDraft]);
  const commitMetadata = useCallback((): void => {
    if (!metadataDraft) return;
    const result = service.set(metadataDraft.path, metadataNode(metadataDraft));
    if (isPortableError(result)) { showError(metadataDraft.path, result); return; }
    setMetadataDraft(null); refreshCommitted();
  }, [metadataDraft, refreshCommitted, service, showError]);
  const commitInvocation = useCallback((): void => {
    if (!invocationDraft || !invocationDraft.method.trim()) return;
    const result = service.set(invocationDraft.path, invocationNode(invocationDraft));
    if (isPortableError(result)) { showError(invocationDraft.path, result); return; }
    setInvocationDraft(null); refreshCommitted();
  }, [invocationDraft, refreshCommitted, service, showError]);
  const commitListItem = useCallback((): void => {
    if (!listItemDraft) return;
    const existing = model && findNode(model, listItemDraft.path);
    const length = existing?.children?.length ?? 0;
    const target = `${listItemDraft.path}[${length}]`;
    const node: PortableNode = listItemDraft.relation
      ? { '@kind': 'context', ...Object.fromEntries(listItemDraft.fields.map(field => [field.name, field.value])) } as PortableNode
      : listItemDraft.fields[0]?.value || '0';
    const result = service.set(`${listItemDraft.path}[${length}]`, node);
    if (isPortableError(result)) { showError(target, result); return; }
    setListItemDraft(null); refreshCommitted();
  }, [listItemDraft, model, refreshCommitted, service, showError]);
  const duplicateListItem = useCallback((node: BoxedRenderNode): void => {
    if (!node.listItem || !model) return;
    const list = findNode(model, node.listItem.path);
    const result = service.set(`${node.listItem.path}[${list?.children?.length ?? 0}]`, node.authored);
    if (isPortableError(result)) { showError(node.path, result); return; }
    refreshCommitted();
  }, [model, refreshCommitted, service, showError]);
  const removeListItem = useCallback((node: BoxedRenderNode): void => {
    if (!node.listItem || !model) return;
    const list = findNode(model, node.listItem.path);
    const original = list?.children?.map(child => child.authored);
    const removed = service.remove(node.path);
    if (isPortableError(removed)) { showError(node.path, removed); return; }
    const validation = service.get(node.listItem.path, 'FIELDS');
    if (!isPortableError(validation)) { refreshCommitted(); return; }
    const restored = original ? service.set(node.listItem.path, original as unknown as PortableNode) : validation;
    if (isPortableError(restored)) { setFatalError(`Could not restore ${node.path}: ${restored.message}`); return; }
    showError(node.path, validation);
  }, [model, refreshCommitted, service, showError]);
  const moveListItem = useCallback((node: BoxedRenderNode, direction: -1 | 1): void => {
    if (!node.listItem || !model) return;
    const list = findNode(model, node.listItem.path);
    const items = list?.children?.map(child => child.authored);
    const from = node.listItem.index; const to = from + direction;
    if (!items || to < 0 || to >= items.length) return;
    [items[from], items[to]] = [items[to], items[from]];
    const result = service.set(node.listItem.path, items as unknown as PortableNode);
    if (isPortableError(result)) { showError(node.path, result); return; }
    refreshCommitted();
  }, [model, refreshCommitted, service, showError]);
  const commitColumn = useCallback((): void => {
    if (!columnDraft || !columnDraft.name.trim()) return;
    const name = columnDraft.name.trim();
    const next = columnDraft.items.map(item => {
      if (!isObject(item)) return item;
      const { '@kind': kind = 'context', ...fields } = item;
      if (columnDraft.action === 'add') return { '@kind': kind, ...fields, [name]: columnDraft.value || '0' } as PortableNode;
      if (columnDraft.action === 'rename' && columnDraft.source) {
        const { [columnDraft.source]: value, ...remaining } = fields;
        return { '@kind': kind, ...remaining, [name]: value } as PortableNode;
      }
      const { [columnDraft.source ?? '']: _removed, ...remaining } = fields;
      return { '@kind': kind, ...remaining } as PortableNode;
    });
    const result = service.set(columnDraft.path, next as unknown as PortableNode);
    if (isPortableError(result)) { showError(columnDraft.path, result); return; }
    setColumnDraft(null); refreshCommitted();
  }, [columnDraft, refreshCommitted, service, showError]);
  const loadMore = useCallback((node: BoxedRenderNode): void => {
    pageSizes.current.set(node.path, (node.list?.loaded ?? 0) + LIST_PAGE_SIZE);
    load(service.toPortable(), false);
  }, [load, service]);

  if (fatalError) return <Alert severity="error" className={className} sx={sx}>{fatalError}</Alert>;
  if (!model || !snapshot) return <Box className={className} sx={sx} aria-busy="true" />;
  return <>
    <Box className={className} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', ...sx }} role="treegrid" aria-label={`Boxed editor ${path}`}>
      {path === '*' && (snapshot['@model-name'] || snapshot['@model-version']) && <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}><Typography variant="subtitle2">{snapshot['@model-name'] ?? 'Model'}{snapshot['@model-version'] ? ` · ${snapshot['@model-version']}` : ''}</Typography></Box>}
      <NodeRow node={model} depth={0} expanded={expanded} editingExpression={editingExpression} editingName={editingName} nameDraft={nameDraft} readOnly={readOnly} snapshot={snapshot} languageService={languageService ?? NOOP_LANGUAGE_SERVICE} errors={errors} toggle={toggle} startExpression={node => setEditingExpression(node.path)} commitExpression={commitExpression} cancelExpression={() => { setEditingExpression(null); setErrors({}); }} startName={node => { setEditingName(node.path); setNameDraft(node.name ?? ''); }} setNameDraft={setNameDraft} commitName={node => guardedRename(node, nameDraft.trim())} duplicate={duplicate} remove={guardedRemove} openInput={node => setInputDraft({ path: node.path, value: typedInput(node.authored) })} openAdd={parent => setAddDraft({ parentPath: parent, name: '', kind: 'expression' })} openSignature={node => { if (isObject(node.authored)) setSignatureDraft({ path: node.path, external: node.kind === 'external-function', parameters: parameterDrafts(node.authored), returnType: typeText(node.authored['@return']), node: node.authored }); }} openMetadata={node => { if (isObject(node.authored)) setMetadataDraft({ path: node.path, node: node.authored, nodeKind: String(node.authored['@node'] ?? ''), nodeName: String(node.authored['@node-name'] ?? ''), description: String(node.authored['@description'] ?? '') }); }} openInvocation={node => { if (isObject(node.authored)) { const argumentsValue = node.authored['@arguments']; setInvocationDraft({ path: node.path, node: node.authored, method: String(node.authored['@method'] ?? ''), named: !Array.isArray(argumentsValue), arguments: Array.isArray(argumentsValue) ? argumentsValue.map(value => ({ name: '', value: expressionText(value as PortableNode) })) : isObject(argumentsValue) ? Object.entries(argumentsValue).map(([name, value]) => ({ name, value: expressionText(value as PortableNode) })) : [] }); } }} openListItem={node => { const fields = node.kind === 'relation' && node.children?.[0] && isObject(node.children[0].authored) ? Object.keys(node.children[0].authored).filter(key => !key.startsWith('@')).map(name => ({ name, value: '0' })) : [{ name: 'value', value: '0' }]; setListItemDraft({ path: node.path, relation: node.kind === 'relation', fields }); }} duplicateListItem={duplicateListItem} removeListItem={removeListItem} moveListItem={moveListItem} loadMore={loadMore} openColumn={(node, action, source) => { const items = node.children?.map(child => child.authored) ?? []; setColumnDraft({ path: node.path, items, action, source, name: action === 'add' ? '' : source ?? '', value: '0' }); }} onOpenNode={onOpenNode} />
    </Box>
    <Dialog open={Boolean(addDraft)} onClose={() => setAddDraft(null)}><DialogTitle>Add field</DialogTitle><DialogContent sx={{ display: 'grid', gap: 2, minWidth: 300 }}><TextField autoFocus label="Name" value={addDraft?.name ?? ''} onChange={event => setAddDraft(current => current ? { ...current, name: event.target.value } : current)} /><Select aria-label="Field kind" value={addDraft?.kind ?? 'expression'} onChange={event => setAddDraft(current => current ? { ...current, kind: event.target.value as AddFieldDraft['kind'] } : current)}><MenuItem value="expression">Expression</MenuItem><MenuItem value="input">Input</MenuItem><MenuItem value="context">Context</MenuItem><MenuItem value="list">Literal list</MenuItem></Select>{addDraft && errors[childPath(addDraft.parentPath, addDraft.name)] && <Alert severity="error">{errors[childPath(addDraft.parentPath, addDraft.name)]}</Alert>}</DialogContent><DialogActions><Button onClick={() => setAddDraft(null)}>Cancel</Button><Button onClick={commitAdd}>Add field</Button></DialogActions></Dialog>
    <Dialog open={Boolean(inputDraft)} onClose={() => setInputDraft(null)}><DialogTitle>Edit input</DialogTitle><DialogContent sx={{ display: 'grid', gap: 1, minWidth: 300 }}><TextField label="Type" value={inputDraft?.value.type ?? ''} onChange={event => setInputDraft(current => current ? { ...current, value: { ...current.value, type: event.target.value } } : current)} /><FormControlLabel control={<Checkbox checked={inputDraft?.value.required === true} onChange={event => setInputDraft(current => current ? { ...current, value: { ...current.value, ...(event.target.checked ? { required: true } : { required: undefined }) } } : current)} />} label="Required" />{inputDraft && errors[inputDraft.path] && <Alert severity="error">{errors[inputDraft.path]}</Alert>}</DialogContent><DialogActions><Button onClick={() => setInputDraft(null)}>Cancel</Button><Button onClick={commitInput}>Save input</Button></DialogActions></Dialog>
    <Dialog open={Boolean(signatureDraft)} onClose={() => setSignatureDraft(null)}><DialogTitle>Edit {signatureDraft?.external ? 'external function' : 'function'} signature</DialogTitle><DialogContent sx={{ display: 'grid', gap: 1, minWidth: 420 }}>{signatureDraft?.parameters.map((parameter, index) => <Box key={index} sx={{ display: 'flex', gap: 1 }}><TextField label={`Parameter ${index + 1} name`} value={parameter.name} onChange={event => setSignatureDraft(current => current ? { ...current, parameters: current.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) } : current)} /><TextField label={`Parameter ${index + 1} type`} value={parameter.type} onChange={event => setSignatureDraft(current => current ? { ...current, parameters: current.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item) } : current)} /><IconButton aria-label={`Remove parameter ${index + 1}`} onClick={() => setSignatureDraft(current => current ? { ...current, parameters: current.parameters.filter((_, itemIndex) => itemIndex !== index) } : current)}><DeleteIcon fontSize="small" /></IconButton></Box>)}<Button onClick={() => setSignatureDraft(current => current ? { ...current, parameters: [...current.parameters, { name: '', type: 'number' }] } : current)}>Add parameter</Button><TextField label="Return type" value={signatureDraft?.returnType ?? ''} onChange={event => setSignatureDraft(current => current ? { ...current, returnType: event.target.value } : current)} />{signatureDraft && errors[signatureDraft.path] && <Alert severity="error">{errors[signatureDraft.path]}</Alert>}</DialogContent><DialogActions><Button onClick={() => setSignatureDraft(null)}>Cancel</Button><Button onClick={commitSignature}>Save signature</Button></DialogActions></Dialog>
    <Dialog open={Boolean(invocationDraft)} onClose={() => setInvocationDraft(null)}><DialogTitle>Edit invocation</DialogTitle><DialogContent sx={{ display: 'grid', gap: 1, minWidth: 420 }}><TextField label="Method" value={invocationDraft?.method ?? ''} onChange={event => setInvocationDraft(current => current ? { ...current, method: event.target.value } : current)} /><FormControlLabel control={<Checkbox checked={invocationDraft?.named === true} onChange={event => setInvocationDraft(current => current ? { ...current, named: event.target.checked, arguments: current.arguments.map(argument => ({ ...argument, name: event.target.checked ? argument.name : '' })) } : current)} />} label="Named arguments" />{invocationDraft?.arguments.map((argument, index) => <Box key={index} sx={{ display: 'flex', gap: 1 }}><TextField label={invocationDraft.named ? `Argument ${index + 1} name` : `Argument ${index + 1}`} value={invocationDraft.named ? argument.name : String(index + 1)} disabled={!invocationDraft.named} onChange={event => setInvocationDraft(current => current ? { ...current, arguments: current.arguments.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) } : current)} /><TextField label={`Argument ${index + 1} expression`} value={argument.value} onChange={event => setInvocationDraft(current => current ? { ...current, arguments: current.arguments.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) } : current)} /><IconButton aria-label={`Remove argument ${index + 1}`} onClick={() => setInvocationDraft(current => current ? { ...current, arguments: current.arguments.filter((_, itemIndex) => itemIndex !== index) } : current)}><DeleteIcon fontSize="small" /></IconButton></Box>)}<Button onClick={() => setInvocationDraft(current => current ? { ...current, arguments: [...current.arguments, { name: '', value: '0' }] } : current)}>Add argument</Button>{invocationDraft && errors[invocationDraft.path] && <Alert severity="error">{errors[invocationDraft.path]}</Alert>}</DialogContent><DialogActions><Button onClick={() => setInvocationDraft(null)}>Cancel</Button><Button onClick={commitInvocation}>Save invocation</Button></DialogActions></Dialog>
    <Dialog open={Boolean(listItemDraft)} onClose={() => setListItemDraft(null)}><DialogTitle>Add {listItemDraft?.relation ? 'relation row' : 'list item'}</DialogTitle><DialogContent sx={{ display: 'grid', gap: 1, minWidth: 360 }}>{listItemDraft?.fields.map((field, index) => <TextField key={field.name} label={listItemDraft.relation ? `${field.name} expression` : 'Item expression'} value={field.value} onChange={event => setListItemDraft(current => current ? { ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) } : current)} />)}</DialogContent><DialogActions><Button onClick={() => setListItemDraft(null)}>Cancel</Button><Button onClick={commitListItem}>Add</Button></DialogActions></Dialog>
    <Dialog open={Boolean(columnDraft)} onClose={() => setColumnDraft(null)}><DialogTitle>{columnDraft?.action === 'add' ? 'Add relation column' : columnDraft?.action === 'rename' ? 'Rename relation column' : 'Delete relation column'}</DialogTitle><DialogContent sx={{ display: 'grid', gap: 1, minWidth: 360 }}>{columnDraft?.action !== 'delete' && <TextField autoFocus label="Column name" value={columnDraft?.name ?? ''} onChange={event => setColumnDraft(current => current ? { ...current, name: event.target.value } : current)} />}{columnDraft?.action === 'add' && <TextField label="Default expression" value={columnDraft?.value ?? ''} onChange={event => setColumnDraft(current => current ? { ...current, value: event.target.value } : current)} />}{columnDraft?.action === 'delete' && <Typography>Delete {columnDraft?.source} from every row?</Typography>}</DialogContent><DialogActions><Button onClick={() => setColumnDraft(null)}>Cancel</Button><Button onClick={commitColumn}>{columnDraft?.action === 'delete' ? 'Delete column' : 'Save column'}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(metadataDraft)} onClose={() => setMetadataDraft(null)}><DialogTitle>Edit metadata</DialogTitle><DialogContent sx={{ display: 'grid', gap: 1, minWidth: 360 }}><TextField label="Node kind" value={metadataDraft?.nodeKind ?? ''} onChange={event => setMetadataDraft(current => current ? { ...current, nodeKind: event.target.value } : current)} /><TextField label="Node label" value={metadataDraft?.nodeName ?? ''} onChange={event => setMetadataDraft(current => current ? { ...current, nodeName: event.target.value } : current)} /><TextField label="Description" multiline minRows={2} value={metadataDraft?.description ?? ''} onChange={event => setMetadataDraft(current => current ? { ...current, description: event.target.value } : current)} />{metadataDraft && errors[metadataDraft.path] && <Alert severity="error">{errors[metadataDraft.path]}</Alert>}</DialogContent><DialogActions><Button onClick={() => setMetadataDraft(null)}>Cancel</Button><Button onClick={commitMetadata}>Save metadata</Button></DialogActions></Dialog>
  </>;
}
