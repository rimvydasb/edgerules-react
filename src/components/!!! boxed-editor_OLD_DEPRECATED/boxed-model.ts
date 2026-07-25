import type {
  PortableContext,
  PortableNode,
  PortableRootContext,
} from '@edgerules/portable';

export type BoxedRenderKind =
  | 'context'
  | 'expression'
  | 'input'
  | 'list'
  | 'relation'
  | 'function'
  | 'external-function'
  | 'editor-link';

export interface BoxedSortableMetadata {
  groupId: string;
  ownerPath: string;
  ownerKind: 'context' | 'function-body' | 'collection' | 'relation-column';
  index: number;
}

export interface RelationColumnRenderNode {
  id: string;
  name: string;
  sortable: BoxedSortableMetadata;
}

interface BaseRenderNode {
  id: string;
  path: string;
  name?: string;
  authored: PortableNode;
  schema?: PortableNode;
  children?: BoxedRenderNode[];
  /** A literal collection item is addressed by its owning list and numeric index. */
  listItem?: { path: string; index: number };
  /** A scalar function body is displayed as `fn.result` but written with its function definition. */
  functionBody?: { path: string };
  parentListTerminal?: boolean;
  /** Identifies an authored sibling group that can be reordered as one unit. */
  sortable?: BoxedSortableMetadata;
  /** Paging data comes from indexed CRUD reads, never from parsing an expression. */
}

export type ContextRenderNode = BaseRenderNode & {
  kind: 'context';
  children?: BoxedRenderNode[];
};
export type ExpressionRenderNode = BaseRenderNode & { kind: 'expression' };
export type InputRenderNode = BaseRenderNode & { kind: 'input' };
export type FunctionRenderNode = BaseRenderNode & {
  kind: 'function';
  children?: BoxedRenderNode[];
};
export type ExternalFunctionRenderNode = BaseRenderNode & {
  kind: 'external-function';
};
export type EditorLinkRenderNode = BaseRenderNode & { kind: 'editor-link' };
export type ListRenderNode = BaseRenderNode & {
  kind: 'list';
  children?: BoxedRenderNode[];
  list: { loaded: number; terminal: boolean; error?: string };
};
export type RelationRenderNode = BaseRenderNode & {
  kind: 'relation';
  children?: BoxedRenderNode[];
  columns: RelationColumnRenderNode[];
  list: { loaded: number; terminal: boolean; error?: string };
};

export type BoxedRenderNode =
  | ContextRenderNode
  | ExpressionRenderNode
  | InputRenderNode
  | ListRenderNode
  | RelationRenderNode
  | FunctionRenderNode
  | ExternalFunctionRenderNode
  | EditorLinkRenderNode;

export interface IndexedListPage {
  items: PortableNode[];
  terminal: boolean;
  error?: string;
}

const METADATA = new Set([
  '@kind',
  '@description',
  '@node',
  '@node-name',
  '@model-name',
  '@model-version',
]);

export function isObject(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

/** Relationship records do not support context presentation metadata. */
export function clearRelationshipContextMetadata(
  node: PortableNode,
): PortableNode {
  if (Array.isArray(node))
    return node.map(clearRelationshipContextMetadata) as PortableNode;
  if (!isObject(node)) return node;
  const context = node['@kind'] === undefined || node['@kind'] === 'context';
  return Object.fromEntries(
    Object.entries(node).flatMap(([name, value]) => {
      if (context && name.startsWith('@') && name !== '@kind') return [];
      return [
        [
          name,
          Array.isArray(value) || isObject(value)
            ? clearRelationshipContextMetadata(value as PortableNode)
            : value,
        ],
      ];
    }),
  ) as PortableNode;
}

function emptyRelationValue(
  value: PortableNode,
  schema: PortableNode | undefined,
): PortableNode {
  const type = isObject(schema) ? schema.type : undefined;
  if (type === 'string') return "''";
  if (type === 'number') return 0;
  if (type === 'boolean') return false;

  if (
    isObject(value) &&
    (value['@kind'] === undefined || value['@kind'] === 'context')
  ) {
    return clearRelationshipContextMetadata({
      '@kind': 'context',
      ...Object.fromEntries(
        authoredFields(value as PortableContext).map(([name, child]) => [
          name,
          emptyRelationValue(child, schemaField(schema, name)),
        ]),
      ),
    } as PortableNode);
  }

  // Arrays, dates, invocations, and other non-scalar expressions retain the
  // first row's valid value. It is a safer draft than inventing syntax or an
  // element type that disagrees with the homogeneous collection schema.
  return clearRelationshipContextMetadata(value);
}

/** Builds a blank row whose field shape and types are anchored by row zero. */
export function createRelationshipRowDraft(
  relation: RelationRenderNode,
): PortableNode | undefined {
  const first = relation.children?.[0];
  if (!first || !isObject(first.authored)) return undefined;
  const itemSchema = isObject(relation.schema)
    ? (relation.schema.items as PortableNode | undefined)
    : undefined;
  return clearRelationshipContextMetadata({
    '@kind': 'context',
    ...Object.fromEntries(
      relation.columns.flatMap((column) => {
        const cell = first.children?.find(
          (child) => child.name === column.name,
        );
        return cell
          ? [
              [
                column.name,
                emptyRelationValue(
                  cell.authored,
                  schemaField(itemSchema, column.name),
                ),
              ],
            ]
          : [];
      }),
    ),
  } as PortableNode);
}

export function discoverRelationColumns(
  items: readonly PortableNode[],
  path: string,
): RelationColumnRenderNode[] {
  const names: string[] = [];
  const discovered = new Set<string>();
  for (const item of items) {
    if (!isObject(item)) continue;
    for (const name of Object.keys(item)) {
      if (name.startsWith('@') || discovered.has(name)) continue;
      discovered.add(name);
      names.push(name);
    }
  }
  return names.map((name, index) => ({
    id: `relation-column:${path}:${name}`,
    name,
    sortable: {
      groupId: `relation-columns:${path}`,
      ownerPath: path,
      ownerKind: 'relation-column',
      index,
    },
  }));
}

export function authoredFields(
  context: PortableContext,
): Array<[string, PortableNode]> {
  return Object.entries(context).flatMap(([name, value]) =>
    !METADATA.has(name) && !name.startsWith('@') && value !== undefined
      ? [[name, value as PortableNode] as [string, PortableNode]]
      : [],
  );
}

export function classifyNode(
  node: PortableNode,
  schema?: PortableNode,
  indexedList?: IndexedListPage,
): BoxedRenderKind {
  const rawKind: unknown = isObject(node) ? node['@kind'] : undefined;
  const kind: string | undefined =
    typeof rawKind === 'string' ? rawKind : undefined;
  if (kind === 'type-definition' || kind === 'ruleset' || kind === 'loop')
    return 'editor-link';
  if (kind === 'function') return 'function';
  if (kind === 'external-function') return 'external-function';
  // Invocations are DSL expressions from the cell's perspective. Their Portable
  // shape is converted to editable call code by the Portable -> Cell Code mapping.
  if (kind === 'invocation') return 'expression';
  if (kind === 'type') return 'input';
  if (kind === 'context' || (isObject(node) && kind === undefined))
    return 'context';
  if (indexedList && isObject(schema) && schema.type === 'array') {
    return indexedList.items.length > 0 &&
      indexedList.items.every(
        (item) =>
          isObject(item) &&
          (item['@kind'] === undefined || item['@kind'] === 'context'),
      )
      ? 'relation'
      : 'list';
  }
  return 'expression';
}

function schemaField(
  schema: PortableNode | undefined,
  name: string,
): PortableNode | undefined {
  return isObject(schema) && name in schema
    ? (schema[name] as PortableNode)
    : undefined;
}

function nodeAtPath(
  root: PortableRootContext,
  path: string,
): PortableNode | undefined {
  if (path === '*') return root;
  let current: PortableNode | undefined = root;
  for (const part of path.split('.')) {
    const match = /^(.*)\[(\d+)]$/.exec(part);
    if (match) {
      if (!isObject(current)) return undefined;
      const list: unknown = current[match[1]];
      current = Array.isArray(list) ? list[Number(match[2])] : undefined;
    } else {
      current = isObject(current)
        ? (current[part] as PortableNode | undefined)
        : undefined;
    }
  }
  return current;
}

/** Resolves authored paths, including function-body CRUD paths (e.g. fn.result). */
export function resolveAuthoredPath(
  root: PortableRootContext,
  path: string,
): PortableNode | undefined {
  const direct = nodeAtPath(root, path);
  if (direct !== undefined) return direct;
  const [functionName, ...bodyPath] = path.split('.');
  const candidate = root[functionName] as PortableNode | undefined;
  if (
    isObject(candidate) &&
    String(candidate['@kind']) === 'function' &&
    bodyPath.length > 0
  ) {
    return nodeAtPath(
      candidate['@body'] as PortableContext,
      bodyPath.join('.'),
    );
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
    children = authoredFields(authored as PortableContext).map(
      ([fieldName, field], index) => ({
        ...renderNode(
          field,
          path === '*' ? fieldName : `${path}.${fieldName}`,
          schemaField(schema, fieldName),
          fieldName,
          indexedLists,
        ),
        sortable: {
          groupId: `context:${path}`,
          ownerPath: path,
          ownerKind: 'context',
          index,
        },
      }),
    );
  }
  if (kind === 'function' && isObject(authored)) {
    const body = authored['@body'] as PortableNode;
    children =
      isObject(body) &&
      (body['@kind'] === 'context' || body['@kind'] === undefined)
        ? authoredFields(body as PortableContext).map(
            ([fieldName, field], index) => ({
              ...renderNode(
                field,
                `${path}.${fieldName}`,
                undefined,
                fieldName,
                indexedLists,
              ),
              sortable: {
                groupId: `function-body:${path}`,
                ownerPath: path,
                ownerKind: 'function-body',
                index,
              },
            }),
          )
        : [
            {
              ...renderNode(
                body,
                `${path}.result`,
                undefined,
                'result',
                indexedLists,
              ),
              functionBody: { path },
            },
          ];
  }
  if ((kind === 'list' || kind === 'relation') && indexedList) {
    const itemSchema = isObject(schema)
      ? (schema.items as PortableNode | undefined)
      : undefined;
    children = indexedList.items.map((item, index) => ({
      ...renderNode(
        item,
        `${path}[${index}]`,
        itemSchema,
        kind === 'relation' ? `Row ${index + 1}` : `Item ${index + 1}`,
        indexedLists,
      ),
      listItem: { path, index },
      ...(indexedList.terminal
        ? {
            sortable: {
              groupId: `collection:${path}`,
              ownerPath: path,
              ownerKind: 'collection' as const,
              index,
            },
          }
        : {}),
    }));
  }
  const base = { id: path, path, name, authored, schema, children };
  if (kind === 'list' || kind === 'relation') {
    if (!indexedList)
      throw new Error(`Missing indexed collection data for ${path}`);
    return {
      ...base,
      kind,
      ...(kind === 'relation'
        ? { columns: discoverRelationColumns(indexedList.items, path) }
        : {}),
      list: {
        loaded: indexedList.items.length,
        terminal: indexedList.terminal,
        ...(indexedList.error ? { error: indexedList.error } : {}),
      },
    } as BoxedRenderNode;
  }
  return { ...base, kind } as BoxedRenderNode;
}
