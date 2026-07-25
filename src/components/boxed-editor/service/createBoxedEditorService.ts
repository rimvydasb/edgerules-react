import type {
  PortableContext,
  PortableError,
  PortableNode,
  PortableRootContext,
} from '@edgerules/portable';
import { isPortableError } from '../../../lib/portable';
import type { BoxedEditorService, BoxedRowData } from '../boxed-editor-types';
import { denormalize } from './denormalize';
import { normalizeNode, normalizeRoot } from './normalize';
import {
  authoredEntries,
  childPath,
  isRecord,
  lastPathName,
  parentPath,
  portableAtPath,
} from './portable-utils';
import { createRowCache, type CachedRows } from './rowCache';

type GetFilter =
  | 'FIELDS'
  | 'TYPE_DEFINITIONS'
  | 'FUNCTION_DEFINITIONS'
  | 'EXTERNAL_DEFINITIONS'
  | 'ALL';

interface MutableDecisionService {
  get(path: string, filter?: GetFilter): PortableNode | PortableError;
  set(path: string, node: PortableNode): PortableNode | PortableError;
  remove(path: string): void | PortableError;
  rename(path: string, newName: string): void | PortableError;
  toPortable(): PortableRootContext;
}

function readAuthored(
  mutable: MutableDecisionService,
  path: string,
): { node?: PortableNode; schema?: PortableNode } {
  let schema = mutable.get(path, 'ALL');
  if (isPortableError(schema)) {
    const root = mutable.toPortable();
    const authored = portableAtPath(root, path);
    if (
      !isRecord(authored) ||
      (authored as unknown as Record<string, unknown>)['@kind'] !== 'optimise'
    ) {
      return {};
    }
    schema = mutable.get(path, 'EXTERNAL_DEFINITIONS');
    if (isPortableError(schema)) return { node: authored };
    return { node: authored, schema };
  }
  if (path.endsWith(']')) return { node: schema, schema };
  const root = mutable.toPortable();
  const authored = path === '*' ? root : portableAtPath(root, path);
  if (
    isRecord(schema) &&
    (schema as unknown as Record<string, unknown>).type === 'array' &&
    isAuthoredArray(authored)
  ) {
    const items: PortableNode[] = [];
    for (let index = 0; ; index += 1) {
      const item = mutable.get(`${path}[${index}]`, 'ALL');
      if (isPortableError(item)) break;
      items.push(item);
    }
    return { node: items as unknown as PortableNode, schema };
  }
  return {
    node: materializeArrays(mutable, authored, schema, path),
    schema,
  };
}

function isAuthoredArray(node: PortableNode | undefined): boolean {
  if (Array.isArray(node)) return true;
  if (!isRecord(node)) return false;
  const record = node as unknown as Record<string, unknown>;
  return (
    record['@kind'] === 'expression' &&
    typeof record.expression === 'string' &&
    record.expression.trimStart().startsWith('[')
  );
}

function materializeArrays(
  mutable: MutableDecisionService,
  node: PortableNode | undefined,
  schema: PortableNode,
  path: string,
): PortableNode | undefined {
  if (node === undefined) return undefined;
  if (
    isRecord(schema) &&
    (schema as unknown as Record<string, unknown>).type === 'array' &&
    isAuthoredArray(node)
  ) {
    const items: PortableNode[] = [];
    for (let index = 0; ; index += 1) {
      const item = mutable.get(`${path}[${index}]`, 'ALL');
      if (isPortableError(item)) break;
      items.push(item);
    }
    return items as unknown as PortableNode;
  }
  if (!isRecord(node) || !isRecord(schema)) return node;
  const nodeRecord = node as unknown as Record<string, unknown>;
  const result = { ...nodeRecord };
  if (nodeRecord['@kind'] === 'function' && isRecord(nodeRecord['@body'])) {
    const definition = mutable.get(`${path}.*`, 'ALL');
    if (
      !isPortableError(definition) &&
      isRecord(definition) &&
      isRecord((definition as unknown as Record<string, unknown>)['@body'])
    ) {
      result['@body'] = materializeArrays(
        mutable,
        nodeRecord['@body'] as PortableNode,
        (definition as unknown as Record<string, unknown>)[
          '@body'
        ] as PortableNode,
        path,
      );
    }
  }
  for (const [name, child] of authoredEntries(node)) {
    const childSchema = (schema as unknown as Record<string, unknown>)[name];
    if (childSchema !== undefined) {
      result[name] = materializeArrays(
        mutable,
        child,
        childSchema as PortableNode,
        childPath(path, name),
      );
    }
  }
  return result as unknown as PortableNode;
}

function loadRows(mutable: MutableDecisionService, path: string): CachedRows {
  const { node, schema } = readAuthored(mutable, path);
  if (path === '*') {
    if (node === undefined) return { rows: [] };
    const row = normalizeRoot(node as PortableContext, schema);
    return { row: { ...row, children: undefined }, rows: row.children ?? [] };
  }

  const rulesMatch = /^(.*)\.rules\[\d+\]$/.exec(path);
  const containingPath = rulesMatch?.[1] ?? parentPath(path);
  if (containingPath !== undefined) {
    const containing = loadRows(mutable, containingPath);
    const match = findNormalizedRow(containing.rows, path);
    if (match) {
      return {
        row: { ...match, children: undefined },
        rows: match.children ?? [],
      };
    }
  }

  if (node === undefined) return { rows: [] };
  const itemIndex = path.match(/\[(\d+)\]$/)?.[1];
  const name =
    lastPathName(path) ??
    `Item ${itemIndex === undefined ? '' : Number(itemIndex) + 1}`;
  const row = normalizeNode(name, path, node, schema);
  return {
    row: { ...row, children: undefined },
    rows: row.children ?? [],
  };
}

function findNormalizedRow(
  rows: BoxedRowData[],
  path: string,
): BoxedRowData | undefined {
  for (const row of rows) {
    if (row.path === path) return row;
    const nested = findNormalizedRow(row.children ?? [], path);
    if (nested) return nested;
  }
  return undefined;
}

function notifyAll(listeners: Set<() => void>): void {
  for (const listener of [...listeners]) listener();
}

function insertIntoObject(
  destination: Record<string, unknown>,
  name: string,
  node: PortableNode,
  index: number,
): Record<string, unknown> {
  const metadata = Object.entries(destination).filter(([key]) =>
    key.startsWith('@'),
  );
  const entries = authoredEntries(destination).filter(([key]) => key !== name);
  entries.splice(Math.max(0, Math.min(index, entries.length)), 0, [name, node]);
  return Object.fromEntries([...metadata, ...entries]);
}

function insertChild(
  destination: PortableNode,
  source: PortableNode,
  sourceName: string | undefined,
  index: number,
  removeIndex?: number,
): PortableNode {
  if (Array.isArray(destination)) {
    const result: PortableNode[] = [...destination];
    if (removeIndex !== undefined) result.splice(removeIndex, 1);
    result.splice(Math.max(0, Math.min(index, result.length)), 0, source);
    return result as unknown as PortableNode;
  }
  if (!isRecord(destination)) return destination;
  const record = destination as unknown as Record<string, unknown>;

  if (record['@kind'] === 'ruleset') {
    const rules: unknown[] = Array.isArray(record['@rules'])
      ? [...record['@rules']]
      : [];
    if (removeIndex !== undefined) rules.splice(removeIndex, 1);
    rules.splice(Math.max(0, Math.min(index, rules.length)), 0, source);
    return { ...record, '@rules': rules } as unknown as PortableNode;
  }
  if (record['@kind'] === 'function') {
    const body = isRecord(record['@body'])
      ? record['@body']
      : { '@kind': 'context' };
    return {
      ...record,
      '@body': insertIntoObject(body, sourceName ?? 'result', source, index),
    } as unknown as PortableNode;
  }
  return insertIntoObject(
    record,
    sourceName ?? `item${index + 1}`,
    source,
    index,
  ) as unknown as PortableNode;
}

function trailingIndex(path: string): number | undefined {
  const match = /\[(\d+)\]$/.exec(path);
  return match ? Number(match[1]) : undefined;
}

export function createBoxedEditorService(
  mutable: MutableDecisionService,
): BoxedEditorService {
  const listeners = new Set<() => void>();
  const cache = createRowCache((path) => loadRows(mutable, path));

  const commit = (
    path: string,
    operation: () => PortableNode | void | PortableError,
  ): PortableNode | void | PortableError => {
    const result = operation();
    if (!isPortableError(result)) {
      cache.invalidate(path);
      notifyAll(listeners);
    }
    return result;
  };

  return {
    getBoxedRowsData(path) {
      return cache.get(path).rows;
    },
    getBoxedRowData(path) {
      return cache.get(path).row;
    },
    setBoxedRowData(path, row) {
      return commit(path, () => mutable.set(path, denormalize(row))) as
        PortableNode | PortableError;
    },
    remove(path) {
      return commit(path, () => mutable.remove(path)) as void | PortableError;
    },
    rename(path, newName) {
      return commit(path, () =>
        mutable.rename(path, newName),
      ) as void | PortableError;
    },
    move(fromPath, toParentPath, index) {
      const root = mutable.toPortable();
      const source =
        portableAtPath(root, fromPath) ?? readAuthored(mutable, fromPath).node;
      const destination =
        readAuthored(mutable, toParentPath).node ??
        portableAtPath(root, toParentPath);
      if (source === undefined || destination === undefined) {
        const read = mutable.get(
          source === undefined ? fromPath : toParentPath,
          'ALL',
        );
        return isPortableError(read)
          ? read
          : {
              '@kind': 'error',
              type: 'EntryNotFound',
              message: `Path not found`,
              path: source === undefined ? fromPath : toParentPath,
            };
      }
      if (!Array.isArray(destination) && !isRecord(destination)) {
        const attemptedPath = childPath(
          toParentPath,
          lastPathName(fromPath) ?? `item${index + 1}`,
        );
        const attempted = mutable.set(attemptedPath, source);
        if (isPortableError(attempted)) return attempted;
        const removed = mutable.remove(fromPath);
        if (isPortableError(removed)) return removed;
        cache.invalidate(fromPath);
        cache.invalidate(toParentPath);
        notifyAll(listeners);
        return undefined;
      }

      const fromParentPath = parentPath(fromPath);
      const destinationRecord = isRecord(destination)
        ? (destination as unknown as Record<string, unknown>)
        : undefined;
      const sameParent =
        fromParentPath === toParentPath ||
        (destinationRecord?.['@kind'] === 'ruleset' &&
          fromParentPath === childPath(toParentPath, 'rules'));
      const destinationNode = insertChild(
        destination,
        source,
        lastPathName(fromPath),
        index,
        sameParent ? trailingIndex(fromPath) : undefined,
      );
      const rulesOwnerPath = toParentPath.endsWith('.rules')
        ? parentPath(toParentPath)
        : undefined;
      const rulesOwner =
        rulesOwnerPath === undefined
          ? undefined
          : portableAtPath(root, rulesOwnerPath);
      const writePath =
        rulesOwnerPath !== undefined && isRecord(rulesOwner)
          ? rulesOwnerPath
          : toParentPath;
      const writeNode =
        rulesOwnerPath !== undefined && isRecord(rulesOwner)
          ? ({
              ...(rulesOwner as unknown as Record<string, unknown>),
              '@rules': destinationNode,
            } as unknown as PortableNode)
          : destinationNode;
      const inserted = mutable.set(writePath, writeNode);
      if (isPortableError(inserted)) return inserted;

      if (!sameParent) {
        const removed = mutable.remove(fromPath);
        if (isPortableError(removed)) return removed;
      }
      cache.invalidate(fromPath);
      cache.invalidate(toParentPath);
      notifyAll(listeners);
      return undefined;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    invalidate(path) {
      cache.invalidate(path);
      notifyAll(listeners);
    },
    toPortable() {
      return mutable.toPortable();
    },
  };
}
