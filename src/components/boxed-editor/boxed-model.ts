import type { PortableContext, PortableNode, PortableRootContext } from '@edgerules/portable';

export type BoxedRenderKind =
  | 'context'
  | 'expression'
  | 'input'
  | 'list'
  | 'relation'
  | 'function'
  | 'external-function'
  | 'invocation'
  | 'editor-link';

export interface BoxedRenderNode {
  id: string;
  path: string;
  kind: BoxedRenderKind;
  name?: string;
  authored: PortableNode;
  schema?: PortableNode;
  children?: BoxedRenderNode[];
}

const METADATA = new Set(['@kind', '@description', '@node', '@node-name', '@model-name', '@model-version']);

export function isObject(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

export function authoredFields(context: PortableContext): Array<[string, PortableNode]> {
  return Object.entries(context).flatMap(([name, value]) =>
    !METADATA.has(name) && !name.startsWith('@') && value !== undefined ? [[name, value as PortableNode] as [string, PortableNode]] : [],
  );
}

export function classifyNode(node: PortableNode, schema?: PortableNode): BoxedRenderKind {
  const rawKind: unknown = isObject(node) ? node['@kind'] : undefined;
  const kind: string | undefined = typeof rawKind === 'string' ? rawKind : undefined;
  if (kind === 'type-definition' || kind === 'ruleset' || kind === 'loop') return 'editor-link';
  if (kind === 'function') return 'function';
  if (kind === 'external-function') return 'external-function';
  if (kind === 'invocation') return 'invocation';
  if (kind === 'type') return 'input';
  if (kind === 'context' || (isObject(node) && kind === undefined)) return 'context';
  if (Array.isArray(node) && isObject(schema) && schema.type === 'array') return 'list';
  return 'expression';
}

function schemaField(schema: PortableNode | undefined, name: string): PortableNode | undefined {
  return isObject(schema) && name in schema ? (schema[name] as PortableNode) : undefined;
}

function nodeAtPath(root: PortableRootContext, path: string): PortableNode | undefined {
  if (path === '*') return root;
  let current: PortableNode | undefined = root;
  for (const part of path.split('.')) {
    const match = /^(.*)\[(\d+)]$/.exec(part);
    if (match) {
      if (!isObject(current)) return undefined;
      const list: unknown = current[match[1]];
      current = Array.isArray(list) ? list[Number(match[2])] : undefined;
    } else {
      current = isObject(current) ? (current[part] as PortableNode | undefined) : undefined;
    }
  }
  return current;
}

/** Resolves authored paths, including function-body CRUD paths (e.g. fn.result). */
export function resolveAuthoredPath(root: PortableRootContext, path: string): PortableNode | undefined {
  const direct = nodeAtPath(root, path);
  if (direct !== undefined) return direct;
  const [functionName, ...bodyPath] = path.split('.');
  const candidate = root[functionName] as PortableNode | undefined;
  if (isObject(candidate) && String(candidate['@kind']) === 'function' && bodyPath.length > 0) {
    return nodeAtPath(candidate['@body'] as PortableContext, bodyPath.join('.'));
  }
  return undefined;
}

export function renderNode(
  authored: PortableNode,
  path: string,
  schema?: PortableNode,
  name?: string,
): BoxedRenderNode {
  const kind = classifyNode(authored, schema);
  let children: BoxedRenderNode[] | undefined;
  if (kind === 'context' && isObject(authored)) {
    children = authoredFields(authored as PortableContext).map(([fieldName, field]) =>
      renderNode(field, path === '*' ? fieldName : `${path}.${fieldName}`, schemaField(schema, fieldName), fieldName),
    );
  }
  if (kind === 'function' && isObject(authored)) {
    const body = authored['@body'] as PortableNode;
    children = [renderNode(body, `${path}.result`, undefined, 'result')];
  }
  return { id: path, path, kind, name, authored, schema, children };
}
