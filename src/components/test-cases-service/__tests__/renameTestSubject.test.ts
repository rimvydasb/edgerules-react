import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createTestCasesService } from '../createTestCasesService';
import { renameTestSubject } from '../renameTestSubject';

function uniqueDbName(): string {
  return `rename-subject-${Math.random().toString(36).slice(2)}`;
}

function waitForHydration(service: { subscribe: (l: () => void) => () => void }): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = service.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
}

describe('renameTestSubject', () => {
  it('carries a renamed callable subject to its new dotted path', async () => {
    const dbName = uniqueDbName();
    const svc = createTestCasesService('model', 'library.eligibility', { dbName });
    await waitForHydration(svc);
    svc.syncRows([{ path: 'age', section: 'inputs', order: 0, present: true }]);
    const testCase = svc.addTestCase();
    svc.setCell(testCase.id, 'age', 'input', '30');
    svc.saveResultSet({
      testCaseId: testCase.id,
      ranAt: 1,
      status: 'ok',
      results: { age: { path: 'age', value: 30, status: 'ok' } },
    });
    svc.dispose();

    await renameTestSubject('model', 'library.eligibility', 'library.checkEligibility', { dbName });

    const moved = createTestCasesService('model', 'library.checkEligibility', { dbName });
    await waitForHydration(moved);
    expect(moved.listRows()).toHaveLength(1);
    expect(moved.getCell(testCase.id, 'age', 'input')).toBe('30');
    expect(moved.getResultSet(testCase.id)?.results.age.value).toBe(30);
    moved.dispose();

    const gone = createTestCasesService('model', 'library.eligibility', { dbName });
    await waitForHydration(gone);
    expect(gone.listRows()).toHaveLength(0);
    gone.dispose();
  });

  it('carries every subject nested beneath a renamed containing context', async () => {
    const dbName = uniqueDbName();
    const eligibility = createTestCasesService('model', 'library.eligibility', { dbName });
    await waitForHydration(eligibility);
    eligibility.addTestCase('E');
    eligibility.dispose();

    const scoring = createTestCasesService('model', 'library.scoring', { dbName });
    await waitForHydration(scoring);
    scoring.addTestCase('S');
    scoring.dispose();

    await renameTestSubject('model', 'library', 'lib', { dbName });

    const movedEligibility = createTestCasesService('model', 'lib.eligibility', { dbName });
    await waitForHydration(movedEligibility);
    expect(movedEligibility.listTestCases().map((c) => c.name)).toEqual(['E']);
    movedEligibility.dispose();

    const movedScoring = createTestCasesService('model', 'lib.scoring', { dbName });
    await waitForHydration(movedScoring);
    expect(movedScoring.listTestCases().map((c) => c.name)).toEqual(['S']);
    movedScoring.dispose();
  });

  it('leaves an unrelated subject untouched', async () => {
    const dbName = uniqueDbName();
    const unrelated = createTestCasesService('model', '*', { dbName });
    await waitForHydration(unrelated);
    unrelated.addTestCase('Root case');
    unrelated.dispose();

    await renameTestSubject('model', 'library.eligibility', 'library.checkEligibility', { dbName });

    const stillThere = createTestCasesService('model', '*', { dbName });
    await waitForHydration(stillThere);
    expect(stillThere.listTestCases().map((c) => c.name)).toEqual(['Root case']);
    stillThere.dispose();
  });
});
