import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { type SxProps, type Theme } from '@mui/material/styles';
import type { PortableError, PortableNode, PortableRootContext } from '@edgerules/portable';
import type { GetFilter } from '@edgerules/web';
import { highlightEdgeRules } from '../code-editor/language/highlight';
import type { CodeEditorService } from '../code-editor/language/service';
import { isPortableError } from '../../lib/portable';
import { isObject, renderNode, resolveAuthoredPath, type BoxedRenderNode } from './boxed-model';

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

function NodeRow({ node, depth, expanded, toggle, onOpenNode }: { node: BoxedRenderNode; depth: number; expanded: Set<string>; toggle: (id: string) => void; onOpenNode?: (target: BoxedEditorOpenTarget) => void }): ReactElement {
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expanded.has(node.id);
  const label = node.kind === 'function' && isObject(node.authored) ? functionSignature(node.authored, node.name) : node.name ?? (node.path === '*' ? 'Model' : node.path);
  const schemaType = typeLabel(node.schema);
  const targetKind = isObject(node.authored) ? node.authored['@kind'] : undefined;
  let value: ReactNode;
  if (node.kind === 'context') value = node.children?.length ? null : <Typography color="text.secondary">Empty context</Typography>;
  else if (node.kind === 'input' && isObject(node.authored)) value = <Typography component="code">&lt;{String(node.authored.type)}{node.authored.required ? ', required' : ''}&gt;</Typography>;
  else if (node.kind === 'external-function' && isObject(node.authored)) value = <Typography component="code">{functionSignature(node.authored, node.name).replace(/^func /, 'external func ')}</Typography>;
  else if (node.kind === 'function') value = null;
  else if (node.kind === 'invocation' && isObject(node.authored)) value = <HighlightedExpression node={invocationText(node.authored)} />;
  else if (node.kind === 'editor-link') {
    const kind = targetKind as BoxedEditorTargetKind;
    const text = kind === 'type-definition' ? 'Open Types Editor' : kind === 'ruleset' ? 'Open Decision Table Editor' : 'Open Loop Editor';
    value = onOpenNode ? <Button size="small" onClick={() => onOpenNode({ path: node.path, kind })}>{text}</Button> : <Typography color="text.secondary">{text}</Typography>;
  } else value = <HighlightedExpression node={node.authored} />;
  return <>
    <Box role="row" aria-label={node.path} aria-level={depth + 1} sx={{ display: 'grid', gridTemplateColumns: '34px minmax(140px, 0.35fr) minmax(200px, 1fr) minmax(100px, 0.2fr)', alignItems: 'start', borderTop: '1px solid', borderColor: 'divider', minHeight: 42 }}>
      <Box role="cell" sx={{ pl: depth * 2 }}>
        {hasChildren && <IconButton size="small" aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.path}`} aria-expanded={isExpanded} onClick={() => toggle(node.id)}>{isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>}
      </Box>
      <Box role="cell" sx={{ py: 1, pr: 1, fontWeight: node.path === '*' ? 700 : 500 }}>{label}</Box>
      <Box role="cell" sx={{ py: 1, pr: 1 }}>{value}</Box>
      <Box role="cell" sx={{ py: 1 }}>{schemaType && <Chip size="small" label={schemaType} />}</Box>
    </Box>
    {hasChildren && isExpanded && node.children?.map(child => <NodeRow key={child.id} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} onOpenNode={onOpenNode} />)}
  </>;
}

export function BoxedEditor({ service, path, revision, onOpenNode, className, sx }: BoxedEditorProps): ReactElement {
  const [model, setModel] = useState<BoxedRenderNode | null>(null);
  const [error, setError] = useState<PortableError | Error | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const authored = service.toPortable();
      const selected = resolveAuthoredPath(authored, path);
      if (!selected) throw new Error(`Path not found: ${path}`);
      const schema = service.get(path, path === '*' ? 'FIELDS' : 'FIELDS');
      if (isPortableError(schema)) { setError(schema); setModel(null); return; }
      // Function definitions are intentionally not part of the FIELDS projection. A directly
      // focused function opens its body, so validate that linked definition projection here.
      if (isObject(selected) && String(selected['@kind']) === 'function') {
        const definition = service.get(`${path}.*`, 'FUNCTION_DEFINITIONS');
        if (isPortableError(definition)) { setError(definition); setModel(null); return; }
      }
      const selectedName = path === '*' ? undefined : path.split('.').at(-1)?.replace(/\[\d+\]$/, '');
      const next = renderNode(selected, path, schema, selectedName);
      setModel(next); setError(null);
      setExpanded(new Set([next.id, ...(path !== '*' ? next.children?.map(child => child.id) ?? [] : [])]));
    } catch (cause) { setError(cause instanceof Error ? cause : new Error(String(cause))); setModel(null); }
  }, [service, path, revision]);
  const toggle = (id: string): void => setExpanded(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  if (error) return <Alert severity="error">{isPortableError(error) ? error.message : error.message}</Alert>;
  if (!model) return <Box className={className} sx={sx} aria-busy="true" />;
  return <Box className={className} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', ...sx }} role="treegrid" aria-label={`Boxed editor ${path}`}>
    <NodeRow node={model} depth={0} expanded={expanded} toggle={toggle} onOpenNode={onOpenNode} />
  </Box>;
}
