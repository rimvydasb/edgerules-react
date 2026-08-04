export const DEFAULT_DB_NAME = 'edgerules-documentation';
const DB_VERSION = 1;
const DESCRIPTIONS_STORE = 'descriptions';

// Sentinel upper bound for a string-keyed IndexedDB range: the highest BMP code point, higher than
// any EdgeRules path character can be, so `IDBKeyRange.bound([modelName, ''], [modelName, UPPER_BOUND])`
// covers every key sharing the `modelName` prefix regardless of the path's contents.
const UPPER_BOUND = '￿';

export interface DescriptionRecord {
  modelName: string;
  path: string;
  description: string;
}

export function openDocumentationDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DESCRIPTIONS_STORE)) {
        db.createObjectStore(DESCRIPTIONS_STORE, { keyPath: ['modelName', 'path'] });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function cursorToArray<T>(request: IDBRequest<IDBCursorWithValue | null>): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        results.push(cursor.value as T);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function hydrateAll(db: IDBDatabase, modelName: string): Promise<DescriptionRecord[]> {
  const tx = db.transaction(DESCRIPTIONS_STORE, 'readonly');
  const range = IDBKeyRange.bound([modelName, ''], [modelName, UPPER_BOUND]);
  return cursorToArray<DescriptionRecord>(tx.objectStore(DESCRIPTIONS_STORE).openCursor(range));
}

export async function put(db: IDBDatabase, record: DescriptionRecord): Promise<void> {
  const tx = db.transaction(DESCRIPTIONS_STORE, 'readwrite');
  tx.objectStore(DESCRIPTIONS_STORE).put(record);
  await txDone(tx);
}

export async function remove(db: IDBDatabase, modelName: string, path: string): Promise<void> {
  const tx = db.transaction(DESCRIPTIONS_STORE, 'readwrite');
  tx.objectStore(DESCRIPTIONS_STORE).delete([modelName, path]);
  await txDone(tx);
}
