import { useSyncExternalStore } from 'react';
import type { TestCasesService, TestResult } from './test-cases-service-types';

// One path's computed outcome out of `testCaseId`'s current `TestResultSet`, or `undefined` when the
// case has not been run, was run before this path existed, or its run failed at the run level.
export function useTestResult(
  service: TestCasesService,
  testCaseId: string,
  path: string,
): TestResult | undefined {
  return useSyncExternalStore(service.subscribe, () => service.getResultSet(testCaseId)?.results[path]);
}
