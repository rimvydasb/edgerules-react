import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createTestCasesService } from '../../../test-cases-service';
import type { TestRow } from '../../../test-cases-service';
import type { TestRunner } from '../../tests-manager-types';
import { rowActionsFor, testCaseActionsFor } from '../actions';

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

const runner: TestRunner = {
  run: vi.fn().mockResolvedValue(undefined),
  runAll: vi.fn().mockResolvedValue(undefined),
  getRunning: () => [],
  subscribe: () => () => {},
};

describe('testCaseActionsFor', () => {
  it('has no Insert left/right entries — the top toolbar Add button covers case creation', async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    const testCase = service.addTestCase('A');

    const labels = testCaseActionsFor(testCase, service, runner).map((a) => a.label);
    expect(labels).not.toContain('Insert left');
    expect(labels).not.toContain('Insert right');
    expect(labels).toContain('Clone');
    expect(labels).not.toContain('Duplicate');

    service.dispose();
  });

  it("Clone copies inputs and assertions and inserts the copy immediately right of the source", async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    const inputRow: TestRow = { path: 'age', section: 'inputs', order: 0, type: 'number', present: true };
    const assertionRow: TestRow = { path: 'eligible', section: 'assertions', order: 0, type: 'boolean', present: true };
    service.syncRows([inputRow, assertionRow]);

    const source = service.addTestCase('Source');
    service.setCell(source.id, 'age', 'input', '30');
    service.setCell(source.id, 'eligible', 'assertion', 'true');
    const other = service.addTestCase('Other');

    const latestSource = service.getTestCase(source.id)!;
    const clone = testCaseActionsFor(latestSource, service, runner).find((a) => a.label === 'Clone');
    clone?.onSelect();

    const ordered = service.listTestCases();
    const sourceIndex = ordered.findIndex((c) => c.id === source.id);
    const cloned = ordered[sourceIndex + 1];
    expect(cloned.id).not.toBe(other.id);
    expect(cloned.inputs.age).toBe('30');
    expect(cloned.assertions.eligible).toBe('true');

    service.dispose();
  });
});

describe('rowActionsFor', () => {
  it("labels the assertions-section action 'Delete' with an icon, and still demotes to validations", async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    const assertionRow: TestRow = { path: 'eligible', section: 'assertions', order: 0, type: 'boolean', present: true };
    service.syncRows([assertionRow]);

    const actions = rowActionsFor(assertionRow, service);
    const deleteAction = actions.find((a) => a.label === 'Delete');
    expect(deleteAction).toBeDefined();
    expect(deleteAction?.icon).toBeTruthy();
    expect(actions.some((a) => a.label === 'Move to Validations')).toBe(false);

    deleteAction?.onSelect();
    expect(service.listRows().find((r) => r.path === 'eligible')?.section).toBe('validations');

    service.dispose();
  });

  it("validations-section action is still 'Move to Assertions'", async () => {
    const service = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(service);
    const validationRow: TestRow = { path: 'score', section: 'validations', order: 0, type: 'number', present: true };
    service.syncRows([validationRow]);

    const labels = rowActionsFor(validationRow, service).map((a) => a.label);
    expect(labels).toContain('Move to Assertions');

    service.dispose();
  });
});
