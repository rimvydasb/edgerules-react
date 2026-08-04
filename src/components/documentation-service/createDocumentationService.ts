import { DEFAULT_DB_NAME, hydrateAll, openDocumentationDb, put, remove } from './indexedDbStore';
import type { DocumentationService, DocumentationServiceOptions, Unsubscribe } from './documentation-service-types';

export function createDocumentationService(
  modelName: string,
  options: DocumentationServiceOptions = {},
): DocumentationService {
  const dbName = options.dbName ?? DEFAULT_DB_NAME;
  const onPersistError = options.onPersistError;

  let disposed = false;
  let db: IDBDatabase | undefined;
  let persistenceEnabled = typeof indexedDB !== 'undefined';

  // Local writes that happen before hydration resolves win over whatever IndexedDB eventually
  // returns for a path — a synchronous caller should never see its own just-made edit vanish
  // underneath it.
  const locallyWritten = new Set<string>();

  const cache = new Map<string, string>();
  const listeners = new Set<() => void>();

  function notify(): void {
    if (disposed) return;
    for (const listener of listeners) listener();
  }

  function persistPut(path: string, description: string): void {
    if (!persistenceEnabled || !db) return;
    put(db, { modelName, path, description }).catch((error: unknown) => {
      onPersistError?.(error, { op: 'setDescription', path });
    });
  }

  function persistDelete(path: string): void {
    if (!persistenceEnabled || !db) return;
    remove(db, modelName, path).catch((error: unknown) => {
      onPersistError?.(error, { op: 'setDescription', path });
    });
  }

  async function hydrate(): Promise<void> {
    if (!persistenceEnabled) {
      queueMicrotask(() => notify());
      return;
    }
    try {
      db = await openDocumentationDb(dbName);
    } catch (error) {
      persistenceEnabled = false;
      onPersistError?.(error, { op: 'hydrate' });
      notify();
      return;
    }
    if (disposed) {
      db.close();
      return;
    }
    try {
      const records = await hydrateAll(db, modelName);
      if (disposed) return;
      for (const record of records) {
        if (!locallyWritten.has(record.path)) {
          cache.set(record.path, record.description);
        }
      }
    } catch (error) {
      onPersistError?.(error, { op: 'hydrate' });
    } finally {
      notify();
    }
  }
  void hydrate();

  const service: DocumentationService = {
    getDescription(path: string): string | undefined {
      return cache.get(path);
    },

    setDescription(path: string, description: string): void {
      locallyWritten.add(path);
      if (description === '') {
        const had = cache.delete(path);
        if (had) persistDelete(path);
      } else {
        cache.set(path, description);
        persistPut(path, description);
      }
      notify();
    },

    renamePath(from: string, to: string): void {
      if (!cache.has(from)) return;
      const description = cache.get(from)!;
      cache.delete(from);
      cache.set(to, description);
      locallyWritten.add(from);
      locallyWritten.add(to);
      if (!persistenceEnabled || !db) {
        notify();
        return;
      }
      // Capture the current connection now — `db` is reassigned to `undefined` by `dispose()`,
      // which could otherwise run between the two awaited steps below.
      const database = db;
      remove(database, modelName, from)
        .then(() => put(database, { modelName, path: to, description }))
        .catch((error: unknown) => {
          onPersistError?.(error, { op: 'renamePath', path: from });
        });
      notify();
    },

    subscribe(listener: () => void): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose(): void {
      disposed = true;
      listeners.clear();
      if (db) {
        db.close();
        db = undefined;
      }
    },
  };

  return service;
}
