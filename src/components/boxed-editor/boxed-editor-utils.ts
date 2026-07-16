import type { PortableNode, PortableTypedValue } from '@edgerules/portable';
import { isPortableError } from '../../lib/portable';
import { isObject, type BoxedRenderNode, type IndexedListPage } from './boxed-model';
import type {
  BoxedEditorService,
  InvocationDraft,
  MetadataDraft,
  SignatureDraft,
  SignatureParameter,
} from './boxed-editor-types';

export const LIST_PAGE_SIZE = 50;

export function typeLabel(schema: PortableNode | undefined): string | undefined {
  if (!isObject(schema)) return undefined;
  const type = schema.type ?? schema['@type'];
  if (typeof type !== 'string') return undefined;
  const direction = schema.readOnly === true ? 'computed' : schema.writeOnly === true ? 'input' : undefined;
  return direction ? `${type} · ${direction}` : type;
}

export function expressionText(node: PortableNode): string {
  if (isObject(node) && String(node['@kind']) === 'expression') return String(node.expression ?? '');
  if (typeof node === 'string') return node;
  return JSON.stringify(node);
}

export function invocationText(node: Record<string, unknown>): string {
  const method = String(node['@method'] ?? '');
  const argumentsValue = node['@arguments'];
  if (Array.isArray(argumentsValue)) return `${method}(${argumentsValue.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(', ')})`;
  if (isObject(argumentsValue)) return `${method}(${Object.entries(argumentsValue).map(([name, value]) => `${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join(', ')})`;
  return `${method}()`;
}

export function functionSignature(node: Record<string, unknown>, name: string | undefined): string {
  const parameters = isObject(node['@parameters'])
    ? Object.entries(node['@parameters']).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : (isObject(value) && typeof value.type === 'string' ? value.type : 'any')}`).join(', ')
    : '';
  const result = node['@return'];
  const returnType = typeof result === 'string' ? result : (isObject(result) && typeof result.type === 'string' ? result.type : '');
  return `func ${name ?? ''}(${parameters})${returnType ? ` → ${returnType}` : ''}`;
}

export function parameterDrafts(node: Record<string, unknown>): SignatureParameter[] {
  return isObject(node['@parameters'])
    ? Object.entries(node['@parameters']).map(([name, value]) => ({ name, type: value === null ? '' : typeText(value) }))
    : [];
}

export function typeText(value: unknown): string {
  return typeof value === 'string' ? value : isObject(value) && typeof value.type === 'string' ? value.type : '';
}

export function signatureNode(draft: SignatureDraft): PortableNode {
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

export function metadataNode(draft: MetadataDraft): PortableNode {
  const { node, nodeKind, nodeName, description } = draft;
  const { '@node': _node, '@node-name': _nodeName, '@description': _description, ...rest } = node;
  return {
    ...rest,
    ...(nodeKind.trim() ? { '@node': nodeKind.trim(), ...(nodeName.trim() ? { '@node-name': nodeName.trim() } : {}) } : {}),
    ...(description.trim() ? { '@description': description.trim() } : {}),
  } as PortableNode;
}

export function invocationNode(draft: InvocationDraft): PortableNode {
  const { node, method, named, arguments: draftArguments } = draft;
  const argumentsValue = named
    ? Object.fromEntries(draftArguments.filter(argument => argument.name.trim()).map(argument => [argument.name.trim(), argument.value]))
    : draftArguments.map(argument => argument.value);
  const { '@type': _type, ...authored } = node;
  return { ...authored, '@kind': 'invocation', '@method': method.trim(), '@arguments': argumentsValue } as PortableNode;
}

export function parentPath(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot === -1 ? '*' : path.slice(0, lastDot);
}

export function childPath(parent: string, name: string): string {
  return parent === '*' ? name : `${parent}.${name}`;
}

export function typedInput(node: PortableNode): PortableTypedValue {
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

export function indexedLists(
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

export function findNode(node: BoxedRenderNode, path: string): BoxedRenderNode | undefined {
  if (node.path === path) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return undefined;
}
