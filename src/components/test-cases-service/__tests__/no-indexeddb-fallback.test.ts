// Deliberately no `fake-indexeddb/auto` import in this file — jsdom ships no IndexedDB
// implementation, so `typeof indexedDB === 'undefined'` genuinely holds here.
import { describe, expect, it } from 'vitest';
import { createTestCasesService } from '../createTestCasesService';

describe('createTestCasesService — no indexedDB available', () => {
  it('operates in-memory only, without throwing', async () => {
    expect(typeof indexedDB).toBe('undefined');

    const service = createTestCasesService('model', '*');
    await new Promise<void>((resolve) => {
      const unsubscribe = service.subscribe(() => {
        unsubscribe();
        resolve();
      });
    });

    const testCase = service.addTestCase('Only case');
    service.setCell(testCase.id, 'age', 'input', '30');
    service.syncRows([{ path: 'age', section: 'inputs', order: 0, present: true }]);
    service.saveResultSet({
      testCaseId: testCase.id,
      ranAt: Date.now(),
      status: 'ok',
      results: { age: { path: 'age', value: 30, status: 'ok' } },
    });

    expect(service.listTestCases()).toHaveLength(1);
    expect(service.getCell(testCase.id, 'age', 'input')).toBe('30');
    expect(service.getResultSet(testCase.id)?.results.age.value).toBe(30);

    service.dispose();
  });
});
