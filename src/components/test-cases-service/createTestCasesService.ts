import {
  DEFAULT_DB_NAME,
  deleteTestResultRecord,
  getAllTestResults,
  getTestCasesRecord,
  openTestCasesDb,
  putTestCasesRecord,
  putTestResultRecord,
} from './indexedDbStore';
import type {
  TestCase,
  TestCasesService,
  TestCasesServiceOptions,
  TestCellKind,
  TestResult,
  TestResultSet,
  TestRow,
  TestSectionId,
  TestSubjectId,
  TestValuesByPath,
  Unsubscribe,
} from './test-cases-service-types';

const SECTION_ORDER: readonly TestSectionId[] = ['inputs', 'assertions', 'validations'];

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneValues(values: TestValuesByPath): TestValuesByPath {
  return { ...values };
}

function cloneCase(testCase: TestCase): TestCase {
  return { ...testCase, inputs: cloneValues(testCase.inputs), assertions: cloneValues(testCase.assertions) };
}

function cloneRow(row: TestRow): TestRow {
  return { ...row };
}

function cloneResultSet(set: TestResultSet): TestResultSet {
  const results: Record<string, TestResult> = {};
  for (const [path, result] of Object.entries(set.results)) {
    results[path] = { ...result };
  }
  return { ...set, results };
}

function compareRows(a: TestRow, b: TestRow): number {
  const sectionDiff = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
  if (sectionDiff !== 0) return sectionDiff;
  return a.order - b.order;
}

// True when `path` is `from` itself, or a nested field beneath it (`from.` prefix).
function matchesPath(path: string, from: string): boolean {
  return path === from || path.startsWith(`${from}.`);
}

function rewritePath(path: string, from: string, to: string): string {
  if (path === from) return to;
  return to + path.slice(from.length);
}

function rewriteValueKeys(
  values: TestValuesByPath,
  from: string,
  to: string,
): { values: TestValuesByPath; changed: boolean } {
  let changed = false;
  const next: TestValuesByPath = {};
  for (const [path, text] of Object.entries(values)) {
    if (matchesPath(path, from)) {
      changed = true;
      next[rewritePath(path, from, to)] = text;
    } else {
      next[path] = text;
    }
  }
  return { values: next, changed };
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

export function createTestCasesService(
  modelName: string,
  subjectId: TestSubjectId,
  options: TestCasesServiceOptions = {},
): TestCasesService {
  const dbName = options.dbName ?? DEFAULT_DB_NAME;
  const onPersistError = options.onPersistError;

  let disposed = false;
  let db: IDBDatabase | undefined;
  let persistenceEnabled = typeof indexedDB !== 'undefined';

  // Local writes that happen before hydration resolves win over whatever IndexedDB eventually
  // returns for `cases`/`rows` — a synchronous caller should never see its own just-made edit
  // vanish underneath it. Results merge instead of being gated, since they are additive and keyed.
  let localCasesOrRowsMutated = false;

  let cases: TestCase[] = [];
  let rows: TestRow[] = [];
  const results = new Map<string, TestResultSet>();

  const listeners = new Set<() => void>();

  // `useSyncExternalStore` requires `getSnapshot` to return a referentially stable value when
  // nothing changed, but every read method below clones its data. `version` — bumped once per
  // `notify()` — gates a per-method cache so repeated reads between mutations return the same
  // reference instead of a fresh clone each call.
  let version = 0;
  let casesCacheVersion = -1;
  let casesCache: TestCase[] = [];
  let rowsCacheVersion = -1;
  let rowsCache: TestRow[] = [];
  let resultsCacheVersion = -1;
  let resultsCache = new Map<string, TestResultSet | undefined>();

  function notify(): void {
    version += 1;
    if (disposed) return;
    for (const listener of listeners) listener();
  }

  function persistCasesAndRows(): void {
    if (!persistenceEnabled || !db) return;
    putTestCasesRecord(db, { modelName, subjectId, cases, rows }).catch((error: unknown) => {
      onPersistError?.(error, { op: 'putTestCases' });
    });
  }

  function persistResult(testCaseId: string, set: TestResultSet): void {
    if (!persistenceEnabled || !db) return;
    putTestResultRecord(db, { modelName, subjectId, testCaseId, set }).catch((error: unknown) => {
      onPersistError?.(error, { op: 'saveResultSet', testCaseId });
    });
  }

  function persistResultDelete(testCaseId: string): void {
    if (!persistenceEnabled || !db) return;
    deleteTestResultRecord(db, modelName, subjectId, testCaseId).catch((error: unknown) => {
      onPersistError?.(error, { op: 'clearResultSet', testCaseId });
    });
  }

  async function hydrate(): Promise<void> {
    if (!persistenceEnabled) {
      queueMicrotask(() => notify());
      return;
    }
    try {
      db = await openTestCasesDb(dbName);
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
      const [record, resultRecords] = await Promise.all([
        getTestCasesRecord(db, modelName, subjectId),
        getAllTestResults(db, modelName, subjectId),
      ]);
      if (disposed) return;
      if (record && !localCasesOrRowsMutated) {
        cases = record.cases;
        rows = record.rows;
      }
      for (const resultRecord of resultRecords) {
        if (!results.has(resultRecord.testCaseId)) {
          results.set(resultRecord.testCaseId, resultRecord.set);
        }
      }
    } catch (error) {
      onPersistError?.(error, { op: 'hydrate' });
    } finally {
      notify();
    }
  }
  void hydrate();

  const service: TestCasesService = {
    listTestCases(): TestCase[] {
      if (casesCacheVersion !== version) {
        casesCache = [...cases].sort((a, b) => a.order - b.order).map(cloneCase);
        casesCacheVersion = version;
      }
      return casesCache;
    },

    getTestCase(testCaseId: string): TestCase | undefined {
      const found = cases.find((c) => c.id === testCaseId);
      return found ? cloneCase(found) : undefined;
    },

    addTestCase(name?: string): TestCase {
      const order = cases.length === 0 ? 0 : Math.max(...cases.map((c) => c.order)) + 1;
      const testCase: TestCase = {
        id: generateId(),
        name: name ?? `Test Case ${cases.length + 1}`,
        order,
        inputs: {},
        assertions: {},
      };
      cases.push(testCase);
      localCasesOrRowsMutated = true;
      persistCasesAndRows();
      notify();
      return cloneCase(testCase);
    },

    renameTestCase(testCaseId: string, name: string): void {
      const testCase = cases.find((c) => c.id === testCaseId);
      if (!testCase) return;
      testCase.name = name;
      localCasesOrRowsMutated = true;
      persistCasesAndRows();
      notify();
    },

    removeTestCase(testCaseId: string): void {
      const index = cases.findIndex((c) => c.id === testCaseId);
      if (index === -1) return;
      cases.splice(index, 1);
      cases.forEach((c, i) => {
        c.order = i;
      });
      results.delete(testCaseId);
      localCasesOrRowsMutated = true;
      persistCasesAndRows();
      persistResultDelete(testCaseId);
      notify();
    },

    moveTestCase(testCaseId: string, toIndex: number): void {
      const ordered = [...cases].sort((a, b) => a.order - b.order);
      const fromIndex = ordered.findIndex((c) => c.id === testCaseId);
      if (fromIndex === -1) return;
      const [item] = ordered.splice(fromIndex, 1);
      ordered.splice(clampIndex(toIndex, ordered.length), 0, item);
      ordered.forEach((c, i) => {
        c.order = i;
      });
      // Keep the backing array itself in this order too — `removeTestCase` reindexes by array
      // position, which must agree with the `.order` field it just wrote.
      cases = ordered;
      localCasesOrRowsMutated = true;
      persistCasesAndRows();
      notify();
    },

    listRows(): TestRow[] {
      if (rowsCacheVersion !== version) {
        rowsCache = [...rows].sort(compareRows).map(cloneRow);
        rowsCacheVersion = version;
      }
      return rowsCache;
    },

    syncRows(derivedRows: TestRow[]): void {
      const existingByPath = new Map(rows.map((r) => [r.path, r]));
      const derivedPaths = new Set(derivedRows.map((r) => r.path));
      const sectionMaxOrder: Record<TestSectionId, number> = { inputs: -1, assertions: -1, validations: -1 };
      for (const existing of rows) {
        if (existing.order > sectionMaxOrder[existing.section]) {
          sectionMaxOrder[existing.section] = existing.order;
        }
      }

      const nextRows: TestRow[] = [];
      for (const derived of derivedRows) {
        const existing = existingByPath.get(derived.path);
        if (existing) {
          nextRows.push({ ...existing, type: derived.type, present: true });
        } else {
          sectionMaxOrder[derived.section] += 1;
          nextRows.push({ ...derived, order: sectionMaxOrder[derived.section], present: true });
        }
      }
      for (const existing of rows) {
        if (!derivedPaths.has(existing.path)) {
          nextRows.push({ ...existing, present: false });
        }
      }

      rows = nextRows;
      localCasesOrRowsMutated = true;
      persistCasesAndRows();
      notify();
    },

    moveRow(path: string, toIndex: number): void {
      const row = rows.find((r) => r.path === path);
      if (!row) return;
      const sectionRows = rows.filter((r) => r.section === row.section).sort((a, b) => a.order - b.order);
      const fromIndex = sectionRows.findIndex((r) => r.path === path);
      const [item] = sectionRows.splice(fromIndex, 1);
      sectionRows.splice(clampIndex(toIndex, sectionRows.length), 0, item);
      sectionRows.forEach((r, i) => {
        r.order = i;
      });
      localCasesOrRowsMutated = true;
      persistCasesAndRows();
      notify();
    },

    setRowSection(path: string, section: TestSectionId): void {
      const row = rows.find((r) => r.path === path);
      if (!row || row.section === section) return;
      const previousSection = row.section;
      const maxOrder = rows.filter((r) => r.section === section).reduce((max, r) => Math.max(max, r.order), -1);
      row.section = section;
      row.order = maxOrder + 1;
      if (previousSection === 'assertions' && section !== 'assertions') {
        for (const testCase of cases) {
          delete testCase.assertions[path];
        }
      }
      localCasesOrRowsMutated = true;
      persistCasesAndRows();
      notify();
    },

    getCell(testCaseId: string, path: string, kind: TestCellKind): string | undefined {
      const testCase = cases.find((c) => c.id === testCaseId);
      if (!testCase) return undefined;
      return (kind === 'input' ? testCase.inputs : testCase.assertions)[path];
    },

    setCell(testCaseId: string, path: string, kind: TestCellKind, text: string): void {
      const testCase = cases.find((c) => c.id === testCaseId);
      if (!testCase) return;
      const map = kind === 'input' ? testCase.inputs : testCase.assertions;
      if (text === '') {
        delete map[path];
      } else {
        map[path] = text;
      }
      localCasesOrRowsMutated = true;
      persistCasesAndRows();
      notify();
    },

    getResultSet(testCaseId: string): TestResultSet | undefined {
      if (resultsCacheVersion !== version) {
        resultsCache = new Map();
        resultsCacheVersion = version;
      }
      if (!resultsCache.has(testCaseId)) {
        const set = results.get(testCaseId);
        resultsCache.set(testCaseId, set ? cloneResultSet(set) : undefined);
      }
      return resultsCache.get(testCaseId);
    },

    saveResultSet(set: TestResultSet): void {
      results.set(set.testCaseId, set);
      persistResult(set.testCaseId, set);
      notify();
    },

    clearResultSet(testCaseId: string): void {
      if (!results.has(testCaseId)) return;
      results.delete(testCaseId);
      persistResultDelete(testCaseId);
      notify();
    },

    renamePath(from: string, to: string): void {
      let changed = false;

      const nextRows = rows.map((row) => {
        if (matchesPath(row.path, from)) {
          changed = true;
          return { ...row, path: rewritePath(row.path, from, to) };
        }
        return row;
      });

      const nextCases = cases.map((testCase) => {
        const inputs = rewriteValueKeys(testCase.inputs, from, to);
        const assertions = rewriteValueKeys(testCase.assertions, from, to);
        if (inputs.changed || assertions.changed) {
          changed = true;
          return { ...testCase, inputs: inputs.values, assertions: assertions.values };
        }
        return testCase;
      });

      for (const [testCaseId, set] of results) {
        let setChanged = false;
        const nextResults: Record<string, TestResult> = {};
        for (const [path, result] of Object.entries(set.results)) {
          if (matchesPath(path, from)) {
            setChanged = true;
            const newPath = rewritePath(path, from, to);
            nextResults[newPath] = { ...result, path: newPath };
          } else {
            nextResults[path] = result;
          }
        }
        if (setChanged) {
          changed = true;
          const nextSet = { ...set, results: nextResults };
          results.set(testCaseId, nextSet);
          persistResult(testCaseId, nextSet);
        }
      }

      if (!changed) return;
      rows = nextRows;
      cases = nextCases;
      localCasesOrRowsMutated = true;
      persistCasesAndRows();
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
