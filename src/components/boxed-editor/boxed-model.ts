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
  /** An invocation argument is displayed as a child row but is written with its owner. */
  invocation?: { path: string; argument: string | number };
  /** A literal collection item is addressed by its owning list and numeric index. */
  listItem?: { path: string; index: number };
  parentListLength?: number;
  parentListTerminal?: boolean;
  /** Paging data comes from indexed CRUD reads, never from parsing an expression. */
  list?: { loaded: number; terminal: boolean; error?: string };
}

export interface IndexedListPage {
  items: PortableNode[];
  terminal: boolean;
  error?: string;
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

export function classifyNode(node: PortableNode, schema?: PortableNode, indexedList?: IndexedListPage): BoxedRenderKind {
  const rawKind: unknown = isObject(node) ? node['@kind'] : undefined;
  const kind: string | undefined = typeof rawKind === 'string' ? rawKind : undefined;
  if (kind === 'type-definition' || kind === 'ruleset' || kind === 'loop') return 'editor-link';
  if (kind === 'function') return 'function';
  if (kind === 'external-function') return 'external-function';
  if (kind === 'invocation') return 'invocation';
  if (kind === 'type') return 'input';
  if (kind === 'context' || (isObject(node) && kind === undefined)) return 'context';
  if (indexedList && isObject(schema) && schema.type === 'array') {
    return indexedList.items[0] && isObject(indexedList.items[0]) && String(indexedList.items[0]['@kind'] ?? '') === 'context'
      ? 'relation'
      : 'list';
  }
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
  indexedLists?: ReadonlyMap<string, IndexedListPage>,
): BoxedRenderNode {
  const indexedList = indexedLists?.get(path);
  const kind = classifyNode(authored, schema, indexedList);
  let children: BoxedRenderNode[] | undefined;
  if (kind === 'context' && isObject(authored)) {
    children = authoredFields(authored as PortableContext).map(([fieldName, field]) =>
      renderNode(field, path === '*' ? fieldName : `${path}.${fieldName}`, schemaField(schema, fieldName), fieldName, indexedLists),
    );
  }
  if (kind === 'function' && isObject(authored)) {
    const body = authored['@body'] as PortableNode;
    children = isObject(body) && (body['@kind'] === 'context' || body['@kind'] === undefined)
      ? authoredFields(body as PortableContext).map(([fieldName, field]) =>
        renderNode(field, `${path}.${fieldName}`, undefined, fieldName, indexedLists),
      )
      : [renderNode(body, `${path}.result`, undefined, 'result', indexedLists)];
  }
  if (kind === 'invocation' && isObject(authored)) {
    const argumentsValue = authored['@arguments'];
    children = Array.isArray(argumentsValue)
      ? argumentsValue.map((argument, index) => ({
        ...renderNode(argument as PortableNode, `${path}.@arguments[${index}]`, undefined, `Argument ${index + 1}`, indexedLists),
        invocation: { path, argument: index },
      }))
      : isObject(argumentsValue)
        ? Object.entries(argumentsValue).map(([argument, value]) => ({
          ...renderNode(value as PortableNode, `${path}.@arguments.${argument}`, undefined, argument, indexedLists),
          invocation: { path, argument },
        }))
        : [];
  }
  if ((kind === 'list' || kind === 'relation') && indexedList) {
    const itemSchema = isObject(schema) ? schema.items as PortableNode | undefined : undefined;
    children = indexedList.items.map((item, index) => ({
      ...renderNode(item, `${path}[${index}]`, itemSchema, kind === 'relation' ? `Row ${index + 1}` : `Item ${index + 1}`, indexedLists),
      listItem: { path, index },
    }));
  }
  return { id: path, path, kind, name, authored, schema, children, ...(indexedList ? { list: { loaded: indexedList.items.length, terminal: indexedList.terminal, ...(indexedList.error ? { error: indexedList.error } : {}) } } : {}) };
}
