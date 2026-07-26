import type { TestCase, TestResultSet, TestRow } from './test-cases-service-types';

export const DEFAULT_DB_NAME = 'edgerules-test-cases';
const DB_VERSION = 1;
const TEST_CASES_STORE = 'testCases';
const TEST_RESULTS_STORE = 'testResults';

// Sentinel upper bound for a string-keyed IndexedDB range: the highest BMP code point, higher than
// any EdgeRules path character can be, so `IDBKeyRange.bound([a], [a, UPPER_BOUND])` covers every
// key sharing the prefix `a` regardless of how many further key-path segments it has.
const UPPER_BOUND = '￿';

export interface TestCasesRecord {
  modelName: string;
  subjectId: string;
  cases: TestCase[];
  rows: TestRow[];
}

export interface TestResultRecord {
  modelName: string;
  subjectId: string;
  testCaseId: string;
  set: TestResultSet;
}

export function openTestCasesDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TEST_CASES_STORE)) {
        db.createObjectStore(TEST_CASES_STORE, { keyPath: ['modelName', 'subjectId'] });
      }
      if (!db.objectStoreNames.contains(TEST_RESULTS_STORE)) {
        db.createObjectStore(TEST_RESULTS_STORE, { keyPath: ['modelName', 'subjectId', 'testCaseId'] });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
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

export async function getTestCasesRecord(
  db: IDBDatabase,
  modelName: string,
  subjectId: string,
): Promise<TestCasesRecord | undefined> {
  const tx = db.transaction(TEST_CASES_STORE, 'readonly');
  const record = await requestToPromise(tx.objectStore(TEST_CASES_STORE).get([modelName, subjectId]));
  return (record as TestCasesRecord | undefined) ?? undefined;
}

export async function putTestCasesRecord(db: IDBDatabase, record: TestCasesRecord): Promise<void> {
  const tx = db.transaction(TEST_CASES_STORE, 'readwrite');
  tx.objectStore(TEST_CASES_STORE).put(record);
  await txDone(tx);
}

export async function deleteTestCasesRecord(db: IDBDatabase, modelName: string, subjectId: string): Promise<void> {
  const tx = db.transaction(TEST_CASES_STORE, 'readwrite');
  tx.objectStore(TEST_CASES_STORE).delete([modelName, subjectId]);
  await txDone(tx);
}

export async function getAllTestCasesRecordsForModel(db: IDBDatabase, modelName: string): Promise<TestCasesRecord[]> {
  const tx = db.transaction(TEST_CASES_STORE, 'readonly');
  const range = IDBKeyRange.bound([modelName], [modelName, UPPER_BOUND]);
  return cursorToArray<TestCasesRecord>(tx.objectStore(TEST_CASES_STORE).openCursor(range));
}

export async function getAllTestResults(
  db: IDBDatabase,
  modelName: string,
  subjectId: string,
): Promise<TestResultRecord[]> {
  const tx = db.transaction(TEST_RESULTS_STORE, 'readonly');
  const range = IDBKeyRange.bound([modelName, subjectId], [modelName, subjectId, UPPER_BOUND]);
  return cursorToArray<TestResultRecord>(tx.objectStore(TEST_RESULTS_STORE).openCursor(range));
}

export async function getAllTestResultRecordsForModel(
  db: IDBDatabase,
  modelName: string,
): Promise<TestResultRecord[]> {
  const tx = db.transaction(TEST_RESULTS_STORE, 'readonly');
  const range = IDBKeyRange.bound([modelName], [modelName, UPPER_BOUND]);
  return cursorToArray<TestResultRecord>(tx.objectStore(TEST_RESULTS_STORE).openCursor(range));
}

export async function putTestResultRecord(db: IDBDatabase, record: TestResultRecord): Promise<void> {
  const tx = db.transaction(TEST_RESULTS_STORE, 'readwrite');
  tx.objectStore(TEST_RESULTS_STORE).put(record);
  await txDone(tx);
}

export async function deleteTestResultRecord(
  db: IDBDatabase,
  modelName: string,
  subjectId: string,
  testCaseId: string,
): Promise<void> {
  const tx = db.transaction(TEST_RESULTS_STORE, 'readwrite');
  tx.objectStore(TEST_RESULTS_STORE).delete([modelName, subjectId, testCaseId]);
  await txDone(tx);
}
