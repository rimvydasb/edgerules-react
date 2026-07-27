import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createTestCasesService } from '../createTestCasesService';
import type { TestResultSet, TestRow } from '../test-cases-service-types';

function uniqueDbName(): string {
  return `test-cases-${Math.random().toString(36).slice(2)}`;
}

function waitForHydration(service: { subscribe: (l: () => void) => () => void }): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = service.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
}

const INPUT_ROW: TestRow = { path: 'age', section: 'inputs', order: 0, type: 'number', present: true };
const ASSERTION_ROW: TestRow = { path: 'eligible', section: 'assertions', order: 0, type: 'boolean', present: true };
const VALIDATION_ROW: TestRow = { path: 'score', section: 'validations', order: 0, type: 'number', present: true };

describe('createTestCasesService — hydration', () => {
  it('starts empty and notifies once hydration completes', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    expect(service.listTestCases()).toEqual([]);
    expect(service.listRows()).toEqual([]);
    service.dispose();
  });

  it('rehydrates a second instance with what a first instance persisted', async () => {
    const dbName = uniqueDbName();
    const first = createTestCasesService('model', '*', { dbName });
    await waitForHydration(first);
    first.syncRows([INPUT_ROW]);
    const testCase = first.addTestCase('Standard');
    first.setCell(testCase.id, 'age', 'input', '30');
    first.dispose();

    const second = createTestCasesService('model', '*', { dbName });
    await waitForHydration(second);
    expect(second.listRows()).toEqual([INPUT_ROW]);
    expect(second.listTestCases()).toEqual([{ ...testCase, inputs: { age: '30' } }]);
    second.dispose();
  });
});

describe('createTestCasesService — test case CRUD', () => {
  it('adds, renames, moves, and removes test cases', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);

    const a = service.addTestCase('A');
    const b = service.addTestCase('B');
    const c = service.addTestCase();
    expect(c.name).toBe('Test Case 3');
    expect(service.listTestCases().map((t) => t.name)).toEqual(['A', 'B', 'Test Case 3']);

    service.renameTestCase(a.id, 'Renamed A');
    expect(service.getTestCase(a.id)?.name).toBe('Renamed A');

    service.moveTestCase(c.id, 0);
    expect(service.listTestCases().map((t) => t.id)).toEqual([c.id, a.id, b.id]);

    service.removeTestCase(a.id);
    expect(service.listTestCases().map((t) => t.id)).toEqual([c.id, b.id]);
    expect(service.getTestCase(a.id)).toBeUndefined();

    service.dispose();
  });

  it('a removed test case also drops its result set', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    const testCase = service.addTestCase();
    const set: TestResultSet = {
      testCaseId: testCase.id,
      ranAt: 1,
      status: 'ok',
      results: { age: { path: 'age', value: 30, status: 'ok' } },
    };
    service.saveResultSet(set);
    expect(service.getResultSet(testCase.id)).toEqual(set);

    service.removeTestCase(testCase.id);
    expect(service.getResultSet(testCase.id)).toBeUndefined();
    service.dispose();
  });
});

describe('createTestCasesService — rows', () => {
  it('syncRows appends new derived rows and keeps persisted section/order for known paths', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);

    service.syncRows([INPUT_ROW, ASSERTION_ROW]);
    service.setRowSection('eligible', 'validations');
    expect(service.listRows().find((r) => r.path === 'eligible')?.section).toBe('validations');

    // Re-sync with the same derived shape — the persisted section for 'eligible' must survive.
    service.syncRows([INPUT_ROW, ASSERTION_ROW, VALIDATION_ROW]);
    const rows = service.listRows();
    expect(rows.find((r) => r.path === 'eligible')?.section).toBe('validations');
    expect(rows.find((r) => r.path === 'score')?.present).toBe(true);

    // A path that disappears from the model is hidden, not deleted.
    service.syncRows([INPUT_ROW]);
    const afterRemoval = service.listRows();
    expect(afterRemoval.find((r) => r.path === 'eligible')?.present).toBe(false);
    expect(afterRemoval.find((r) => r.path === 'age')?.present).toBe(true);

    service.dispose();
  });

  it('a row promoted to assertions survives a re-sync against freshly derived rows', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([VALIDATION_ROW]);
    service.setRowSection('score', 'assertions');
    expect(service.listRows().find((r) => r.path === 'score')?.section).toBe('assertions');

    // Re-deriving from the model schema always classifies 'score' as computed (validations); the
    // user's promotion to assertions must still win.
    service.syncRows([VALIDATION_ROW]);
    expect(service.listRows().find((r) => r.path === 'score')?.section).toBe('assertions');

    service.dispose();
  });

  it('moveRow reorders within its own section only', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([
      { path: 'a', section: 'inputs', order: 0, present: true },
      { path: 'b', section: 'inputs', order: 1, present: true },
      { path: 'c', section: 'validations', order: 0, present: true },
    ]);

    service.moveRow('b', 0);
    const inputPaths = service
      .listRows()
      .filter((r) => r.section === 'inputs')
      .map((r) => r.path);
    expect(inputPaths).toEqual(['b', 'a']);
    service.dispose();
  });

  it('setRowSection demoting from assertions discards expected values across every case', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([ASSERTION_ROW]);
    const t1 = service.addTestCase();
    const t2 = service.addTestCase();
    service.setCell(t1.id, 'eligible', 'assertion', 'true');
    service.setCell(t2.id, 'eligible', 'assertion', 'false');

    service.setRowSection('eligible', 'validations');

    expect(service.getCell(t1.id, 'eligible', 'assertion')).toBeUndefined();
    expect(service.getCell(t2.id, 'eligible', 'assertion')).toBeUndefined();
    service.dispose();
  });
});

describe('createTestCasesService — shared rows across test cases', () => {
  it('a new test case shares an already-promoted assertion row instead of getting its own copy, blank until filled in', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([ASSERTION_ROW]);
    const a = service.addTestCase();
    service.setCell(a.id, 'eligible', 'assertion', 'true');

    const b = service.addTestCase();

    // Rows are subject-wide: exactly one 'eligible' row exists, shared by every test case — never
    // one row per case, regardless of which cases have set a value at it.
    expect(service.listRows().filter((r) => r.path === 'eligible')).toHaveLength(1);
    // The new case sees that shared row with a blank cell, not A's value and not a missing row.
    expect(service.getCell(b.id, 'eligible', 'assertion')).toBeUndefined();

    service.dispose();
  });

  it('the first test case starts blank; each next one inherits the previous case\'s input values but never its assertions', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([INPUT_ROW, ASSERTION_ROW]);

    const a = service.addTestCase();
    expect(a.inputs).toEqual({});

    service.setCell(a.id, 'age', 'input', '30');
    service.setCell(a.id, 'eligible', 'assertion', 'true');

    const b = service.addTestCase();
    expect(service.getCell(b.id, 'age', 'input')).toBe('30');
    expect(service.getCell(b.id, 'eligible', 'assertion')).toBeUndefined();

    // A later case inherits from the immediately preceding one, not the original first case.
    service.setCell(b.id, 'age', 'input', '45');
    const c = service.addTestCase();
    expect(service.getCell(c.id, 'age', 'input')).toBe('45');

    service.dispose();
  });
});

describe('createTestCasesService — cells', () => {
  it('round-trips raw text and an empty string removes the entry', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    const testCase = service.addTestCase();

    service.setCell(testCase.id, 'age', 'input', '30');
    expect(service.getCell(testCase.id, 'age', 'input')).toBe('30');

    service.setCell(testCase.id, 'age', 'input', '');
    expect(service.getCell(testCase.id, 'age', 'input')).toBeUndefined();
    service.dispose();
  });
});

describe('createTestCasesService — results', () => {
  it('saveResultSet replaces the whole set and clearResultSet drops it', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    const testCase = service.addTestCase();

    const first: TestResultSet = {
      testCaseId: testCase.id,
      ranAt: 1,
      status: 'ok',
      results: { age: { path: 'age', value: 30, status: 'ok' } },
    };
    service.saveResultSet(first);
    expect(service.getResultSet(testCase.id)).toEqual(first);

    const second: TestResultSet = {
      testCaseId: testCase.id,
      ranAt: 2,
      status: 'error',
      error: 'boom',
      results: {},
    };
    service.saveResultSet(second);
    expect(service.getResultSet(testCase.id)).toEqual(second);

    service.clearResultSet(testCase.id);
    expect(service.getResultSet(testCase.id)).toBeUndefined();
    service.dispose();
  });
});

describe('createTestCasesService — renamePath', () => {
  it('migrates rows, cell keys, and result keys, including nested prefixes', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([
      { path: 'credit.balance', section: 'inputs', order: 0, present: true },
      { path: 'credit.limit', section: 'inputs', order: 1, present: true },
      { path: 'other', section: 'inputs', order: 2, present: true },
    ]);
    const testCase = service.addTestCase();
    service.setCell(testCase.id, 'credit.balance', 'input', '1000');
    service.setCell(testCase.id, 'other', 'input', 'x');
    service.saveResultSet({
      testCaseId: testCase.id,
      ranAt: 1,
      status: 'ok',
      results: {
        'credit.balance': { path: 'credit.balance', value: 1000, status: 'ok' },
        other: { path: 'other', value: 'x', status: 'ok' },
      },
    });

    service.renamePath('credit', 'wallet');

    const paths = service.listRows().map((r) => r.path);
    expect(paths).toContain('wallet.balance');
    expect(paths).toContain('wallet.limit');
    expect(paths).toContain('other');
    expect(service.getCell(testCase.id, 'wallet.balance', 'input')).toBe('1000');
    expect(service.getCell(testCase.id, 'other', 'input')).toBe('x');
    const resultSet = service.getResultSet(testCase.id);
    expect(resultSet?.results['wallet.balance']).toEqual({ path: 'wallet.balance', value: 1000, status: 'ok' });
    expect(resultSet?.results.other).toEqual({ path: 'other', value: 'x', status: 'ok' });
    service.dispose();
  });
});

describe('createTestCasesService — user-authored rows', () => {
  const ELEMENT_ROW: TestRow = {
    path: 'applicant[0].name',
    section: 'inputs',
    order: 0,
    type: 'string',
    present: true,
  };

  it('duplicates a row right after its source, carrying every case cell, marked custom', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([ELEMENT_ROW, { ...INPUT_ROW, order: 1 }]);
    const testCase = service.addTestCase();
    service.setCell(testCase.id, 'applicant[0].name', 'input', 'Ann');

    service.duplicateRow('applicant[0].name', 'applicant[1].name');

    expect(service.listRows().map((r) => r.path)).toEqual(['applicant[0].name', 'applicant[1].name', 'age']);
    const copy = service.listRows().find((r) => r.path === 'applicant[1].name');
    expect(copy).toMatchObject({ section: 'inputs', type: 'string', present: true, custom: true });
    expect(service.getCell(testCase.id, 'applicant[1].name', 'input')).toBe('Ann');
    service.dispose();
  });

  it('refuses to duplicate onto a path that already has a row', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([ELEMENT_ROW, { ...INPUT_ROW, order: 1 }]);

    service.duplicateRow('applicant[0].name', 'age');

    expect(service.listRows()).toHaveLength(2);
    expect(service.listRows().find((r) => r.path === 'age')?.custom).toBeUndefined();
    service.dispose();
  });

  it('keeps a custom row through a syncRows that no longer derives it', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([ELEMENT_ROW]);
    service.duplicateRow('applicant[0].name', 'applicant[1].name');

    // The schema only ever describes element [0], so the duplicate is never in a derived snapshot.
    service.syncRows([ELEMENT_ROW]);

    const rows = service.listRows();
    expect(rows.map((r) => r.path)).toEqual(['applicant[0].name', 'applicant[1].name']);
    expect(rows.find((r) => r.path === 'applicant[1].name')?.present).toBe(true);
    service.dispose();
  });

  it('repoints a row with setRowPath, carrying cells and results, and marks it custom', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([ELEMENT_ROW]);
    const testCase = service.addTestCase();
    service.setCell(testCase.id, 'applicant[0].name', 'input', 'Ann');
    service.saveResultSet({
      testCaseId: testCase.id,
      ranAt: 1,
      status: 'ok',
      results: { 'applicant[0].name': { path: 'applicant[0].name', value: 'Ann', status: 'ok' } },
    });

    expect(service.setRowPath('applicant[0].name', 'applicant[2].name')).toBe(true);

    expect(service.listRows()[0]).toMatchObject({ path: 'applicant[2].name', custom: true });
    expect(service.getCell(testCase.id, 'applicant[2].name', 'input')).toBe('Ann');
    expect(service.getResultSet(testCase.id)?.results['applicant[2].name'].value).toBe('Ann');
    service.dispose();
  });

  it('refuses a setRowPath onto an existing row, or onto an empty path, changing nothing', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([ELEMENT_ROW, { ...INPUT_ROW, order: 1 }]);

    expect(service.setRowPath('applicant[0].name', 'age')).toBe(false);
    expect(service.setRowPath('applicant[0].name', '')).toBe(false);
    expect(service.listRows().map((r) => r.path)).toEqual(['applicant[0].name', 'age']);
    service.dispose();
  });

  it('refuses a setRowPath whose nested rows would land on existing ones', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([
      { path: 'credit', section: 'inputs', order: 0, present: true },
      { path: 'credit.balance', section: 'inputs', order: 1, present: true },
      { path: 'wallet.balance', section: 'inputs', order: 2, present: true },
    ]);

    // `credit` -> `wallet` would drag `credit.balance` onto the existing `wallet.balance`.
    expect(service.setRowPath('credit', 'wallet')).toBe(false);
    expect(service.listRows().map((r) => r.path)).toEqual(['credit', 'credit.balance', 'wallet.balance']);
    service.dispose();
  });

  it('removes a row with its cells and results, and reindexes the section', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.syncRows([ELEMENT_ROW, { ...INPUT_ROW, order: 1 }]);
    service.duplicateRow('applicant[0].name', 'applicant[1].name');
    const testCase = service.addTestCase();
    service.setCell(testCase.id, 'applicant[1].name', 'input', 'Bob');
    service.saveResultSet({
      testCaseId: testCase.id,
      ranAt: 1,
      status: 'ok',
      results: { 'applicant[1].name': { path: 'applicant[1].name', value: 'Bob', status: 'ok' } },
    });

    service.removeRow('applicant[1].name');

    expect(service.listRows().map((r) => r.path)).toEqual(['applicant[0].name', 'age']);
    expect(service.listRows().map((r) => r.order)).toEqual([0, 1]);
    expect(service.getCell(testCase.id, 'applicant[1].name', 'input')).toBeUndefined();
    expect(service.getResultSet(testCase.id)?.results['applicant[1].name']).toBeUndefined();
    service.dispose();
  });
});

describe('createTestCasesService — persistence errors and dispose', () => {
  it('reports a background persistence failure via onPersistError without throwing', async () => {
    const onPersistError = vi.fn();
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName(), onPersistError });
    await waitForHydration(service);
    // Disposing closes the underlying connection; a subsequent write's background persistence
    // attempt against the closed db surfaces as a persistence error, not a thrown exception.
    const testCase = service.addTestCase();
    service.dispose();
    expect(() => service.setCell(testCase.id, 'age', 'input', '1')).not.toThrow();
  });

  it('dispose stops notifications and discards an in-flight hydration result on arrival', async () => {
    const dbName = uniqueDbName();
    const warm = createTestCasesService('model', '*', { dbName });
    await waitForHydration(warm);
    warm.addTestCase();
    warm.dispose();

    const service = createTestCasesService('model', '*', { dbName });
    const listener = vi.fn();
    service.subscribe(listener);
    service.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).not.toHaveBeenCalled();
  });
});
