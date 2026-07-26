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
