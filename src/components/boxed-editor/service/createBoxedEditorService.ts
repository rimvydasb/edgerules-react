import type {
  PortableContext,
  PortableError,
  PortableNode,
  PortableRootContext,
} from '@edgerules/portable';
import { isPortableError } from '../../../lib/portable';
import type { BoxedEditorService, BoxedRowData } from '../boxed-editor-types';
import { denormalize, denormalizeTypeField } from './denormalize';
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
  link(): void;
}

function readAuthored(
  mutable: MutableDecisionService,
  path: string,
): { node?: PortableNode; schema?: PortableNode } {
  const schema = mutable.get(path, 'ALL');
  if (isPortableError(schema)) return {};
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

interface OptimisationOwner {
  path: string;
  node: PortableNode;
}

function optimisationOwner(
  root: PortableRootContext,
  path: string,
): OptimisationOwner | undefined {
  if (path === '*') return undefined;
  const name = /^[^.[\]]+/.exec(path)?.[0];
  if (!name) return undefined;
  const node = root[name];
  if (
    !isRecord(node) ||
    (node as unknown as Record<string, unknown>)['@kind'] !== 'optimise'
  ) {
    return undefined;
  }
  return { path: name, node: node as PortableNode };
}

function optimisationPathKeys(ownerPath: string, path: string): string[] {
  const relative = path.slice(ownerPath.length + 1).split('.');
  return relative.map((name, index) => (index === 0 ? `@${name}` : name));
}

function updateNestedRecord(
  value: PortableNode,
  keys: string[],
  update: (record: Record<string, unknown>, key: string) => void,
): PortableNode {
  const visit = (
    record: Record<string, unknown>,
    index: number,
  ): Record<string, unknown> => {
    const result = { ...record };
    const key = keys[index];
    if (index === keys.length - 1) {
      update(result, key);
      return result;
    }
    const child = result[key];
    if (!isRecord(child)) return result;
    result[key] = visit(child, index + 1);
    return result;
  };
  return visit(value as unknown as Record<string, unknown>, 0) as PortableNode;
}

function setOptimisationChild(
  owner: OptimisationOwner,
  path: string,
  node: PortableNode,
): PortableNode {
  const keys = optimisationPathKeys(owner.path, path);
  let value: unknown = node;
  if (
    keys.length === 1 &&
    (keys[0] === '@variables' || keys[0] === '@constraints') &&
    isRecord(node)
  ) {
    value = Object.fromEntries(authoredEntries(node));
  }
  return updateNestedRecord(owner.node, keys, (record, key) => {
    record[key] = value;
  });
}

function removeOptimisationChild(
  owner: OptimisationOwner,
  path: string,
): PortableNode {
  return updateNestedRecord(
    owner.node,
    optimisationPathKeys(owner.path, path),
    (record, key) => {
      delete record[key];
    },
  );
}

function renameOptimisationChild(
  owner: OptimisationOwner,
  path: string,
  newName: string,
): PortableNode {
  return updateNestedRecord(
    owner.node,
    optimisationPathKeys(owner.path, path),
    (record, key) => {
      const renamed = Object.entries(record).map(([name, value]) =>
        name === key ? [newName, value] : [name, value],
      );
      for (const name of Object.keys(record)) delete record[name];
      Object.assign(record, Object.fromEntries(renamed));
    },
  );
}

interface ComplexTypeOwner {
  path: string;
  node: PortableNode;
}

/**
 * The top-level named `type X: {...}` a nested member path belongs to, if any. The engine only
 * exposes a `type-definition` as one atomic whole (`set_user_type` replaces its whole `TypeBody`);
 * no member path inside it — however deeply nested through inline anonymous object types — is
 * itself addressable by `set`/`remove`/`rename` (each rejects with `WrongFieldPath`). So every
 * member edit is coalesced into a whole-parent rewrite of this owner, the same shape
 * `optimisationOwner` already gives `@optimise` settings.
 */
function complexTypeOwner(
  root: PortableRootContext,
  path: string,
): ComplexTypeOwner | undefined {
  if (path === '*') return undefined;
  const name = /^[^.[\]]+/.exec(path)?.[0];
  if (!name) return undefined;
  const node = root[name];
  if (
    !isRecord(node) ||
    (node as unknown as Record<string, unknown>)['@kind'] !== 'type-definition'
  ) {
    return undefined;
  }
  return { path: name, node: node as PortableNode };
}

function complexTypePathKeys(ownerPath: string, path: string): string[] {
  return path.slice(ownerPath.length + 1).split('.');
}

function setComplexTypeChild(
  owner: ComplexTypeOwner,
  path: string,
  node: PortableNode,
): PortableNode {
  return updateNestedRecord(
    owner.node,
    complexTypePathKeys(owner.path, path),
    (record, key) => {
      record[key] = node;
    },
  );
}

function removeComplexTypeChild(
  owner: ComplexTypeOwner,
  path: string,
): PortableNode {
  return updateNestedRecord(
    owner.node,
    complexTypePathKeys(owner.path, path),
    (record, key) => {
      delete record[key];
    },
  );
}

function renameComplexTypeChild(
  owner: ComplexTypeOwner,
  path: string,
  newName: string,
): PortableNode {
  return updateNestedRecord(
    owner.node,
    complexTypePathKeys(owner.path, path),
    (record, key) => {
      const renamed = Object.entries(record).map(([name, value]) =>
        name === key ? [newName, value] : [name, value],
      );
      for (const name of Object.keys(record)) delete record[name];
      Object.assign(record, Object.fromEntries(renamed));
    },
  );
}

/** The record that directly contains the member being renamed/removed — its own key set is what
 * a rename must not collide with. Unlike `mutable.rename` on an ordinary path, nothing here asks
 * the engine to validate the new name (the whole rewrite is a single opaque `set`), so
 * `rename()` below checks for a collision itself before ever calling `renameComplexTypeChild`. */
function complexTypeSiblingRecord(
  owner: ComplexTypeOwner,
  path: string,
): Record<string, unknown> | undefined {
  const keys = complexTypePathKeys(owner.path, path);
  let current: unknown = owner.node;
  for (let index = 0; index < keys.length - 1; index += 1) {
    if (!isRecord(current)) return undefined;
    current = (current as unknown as Record<string, unknown>)[keys[index]];
  }
  return isRecord(current) ? (current as unknown as Record<string, unknown>) : undefined;
}

/**
 * Writes `node` at `writePath`, then confirms the model still links — `set()` itself never rolls
 * back or throws for a linking reason anymore (`CRUD_SPEC.md` §2, ex-`LINKING_FIX.md` §3.5), so a write that leaves the
 * model unlinkable must be caught and undone here instead. Scoped to `setBoxedRowData` only: a
 * value edit is expected to be self-contained, so an edit that breaks linking is rejected in place,
 * same as the old (pre-upgrade) engine's implicit set()-rollback behavior. `remove`/`rename`/`move`
 * deliberately keep no such check (Resolved Decision #12, `phase-08-quality-gate.md`) — those may
 * legitimately leave a *different* row's reference dangling, and rolling them back would make
 * renaming/removing anything another row still refers to impossible.
 */
function setWithLinkCheck(
  mutable: MutableDecisionService,
  writePath: string,
  writeNode: PortableNode,
  previousNode: PortableNode | undefined,
): PortableNode | PortableError {
  const result = mutable.set(writePath, writeNode);
  if (isPortableError(result)) return result;
  try {
    mutable.link();
    return result;
  } catch (linkError) {
    if (previousNode === undefined) {
      mutable.remove(writePath);
    } else {
      mutable.set(writePath, previousNode);
    }
    return linkError as PortableError;
  }
}

function duplicateNameError(path: string, name: string): PortableError {
  return {
    '@kind': 'error',
    type: 'DuplicateName',
    message: `A field named "${name}" already exists.`,
    path,
  } as PortableError;
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
      return commit(path, () => {
        const root = mutable.toPortable();
        const owner = optimisationOwner(root, path);
        if (owner && owner.path !== path) {
          let updated = owner.node;
          if (row.kind === 'optimisation-objective') {
            updated = removeOptimisationChild(
              { ...owner, node: updated },
              `${owner.path}.maximise`,
            );
            updated = removeOptimisationChild(
              { ...owner, node: updated },
              `${owner.path}.minimise`,
            );
            return setWithLinkCheck(
              mutable,
              owner.path,
              setOptimisationChild(
                { ...owner, node: updated },
                `${owner.path}.${row.name}`,
                denormalize(row),
              ),
              owner.node,
            );
          }
          return setWithLinkCheck(
            mutable,
            owner.path,
            setOptimisationChild(owner, path, denormalize(row)),
            owner.node,
          );
        }

        const typeOwner = complexTypeOwner(root, path);
        if (typeOwner && typeOwner.path !== path) {
          return setWithLinkCheck(
            mutable,
            typeOwner.path,
            setComplexTypeChild(typeOwner, path, denormalizeTypeField(row)),
            typeOwner.node,
          );
        }
        return setWithLinkCheck(
          mutable,
          path,
          denormalize(row),
          portableAtPath(root, path),
        );
      }) as PortableNode | PortableError;
    },
    remove(path) {
      return commit(path, () => {
        const root = mutable.toPortable();
        const owner = optimisationOwner(root, path);
        if (owner && owner.path !== path) {
          const result = mutable.set(
            owner.path,
            removeOptimisationChild(owner, path),
          );
          return isPortableError(result) ? result : undefined;
        }
        const typeOwner = complexTypeOwner(root, path);
        if (typeOwner && typeOwner.path !== path) {
          const result = mutable.set(
            typeOwner.path,
            removeComplexTypeChild(typeOwner, path),
          );
          return isPortableError(result) ? result : undefined;
        }
        return mutable.remove(path);
      }) as void | PortableError;
    },
    rename(path, newName) {
      return commit(path, () => {
        const root = mutable.toPortable();
        const currentName = lastPathName(path);
        const ownerPath = parentPath(path);
        const siblings =
          ownerPath === '*'
            ? root
            : ownerPath
              ? portableAtPath(root, ownerPath)
              : undefined;
        if (
          newName !== currentName &&
          isRecord(siblings) &&
          Object.prototype.hasOwnProperty.call(siblings, newName)
        ) {
          return duplicateNameError(path, newName);
        }

        const owner = optimisationOwner(root, path);
        if (owner && owner.path !== path) {
          const result = mutable.set(
            owner.path,
            renameOptimisationChild(owner, path, newName),
          );
          return isPortableError(result) ? result : undefined;
        }
        const typeOwner = complexTypeOwner(root, path);
        if (typeOwner && typeOwner.path !== path) {
          const siblings = complexTypeSiblingRecord(typeOwner, path);
          if (
            newName !== currentName &&
            siblings &&
            Object.prototype.hasOwnProperty.call(siblings, newName)
          ) {
            return duplicateNameError(path, newName);
          }
          const result = mutable.set(
            typeOwner.path,
            renameComplexTypeChild(typeOwner, path, newName),
          );
          return isPortableError(result) ? result : undefined;
        }
        return mutable.rename(path, newName);
      }) as void | PortableError;
    },
    move(fromPath, toParentPath, index) {
      const root = mutable.toPortable();
      const sourceOwner = optimisationOwner(root, fromPath);
      const destinationOwner = optimisationOwner(root, toParentPath);
      const movesOptimisationChild =
        (sourceOwner && sourceOwner.path !== fromPath) ||
        (destinationOwner && destinationOwner.path !== toParentPath);
      if (movesOptimisationChild) {
        if (
          !sourceOwner ||
          !destinationOwner ||
          sourceOwner.path !== destinationOwner.path
        ) {
          const attempted = mutable.get(fromPath, 'ALL');
          return isPortableError(attempted)
            ? attempted
            : {
                '@kind': 'error',
                type: 'WrongFieldPath',
                message: 'Optimise declarations are root-only whole nodes',
                path: fromPath,
              };
        }
        const source = portableAtPath(root, fromPath);
        const destination = portableAtPath(root, toParentPath);
        if (
          source === undefined ||
          (!Array.isArray(destination) && !isRecord(destination))
        ) {
          return {
            '@kind': 'error',
            type: 'EntryNotFound',
            message: 'Path not found',
            path: source === undefined ? fromPath : toParentPath,
          };
        }
        const sameParent = parentPath(fromPath) === toParentPath;
        const destinationNode = insertChild(
          destination,
          source,
          lastPathName(fromPath),
          index,
          sameParent ? trailingIndex(fromPath) : undefined,
        );
        let updated = setOptimisationChild(
          sourceOwner,
          toParentPath,
          destinationNode,
        );
        if (!sameParent) {
          updated = removeOptimisationChild(
            { ...sourceOwner, node: updated },
            fromPath,
          );
        }
        const result = mutable.set(sourceOwner.path, updated);
        if (isPortableError(result)) return result;
        cache.invalidate(fromPath);
        cache.invalidate(toParentPath);
        notifyAll(listeners);
        return undefined;
      }
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
    link() {
      try {
        mutable.link();
        return undefined;
      } catch (error) {
        return error as PortableError;
      }
    },
  };
}
