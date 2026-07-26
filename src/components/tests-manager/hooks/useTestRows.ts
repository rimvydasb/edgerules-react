import { useSyncExternalStore } from 'react';
import type { TestCasesService, TestRow } from '../../test-cases-service';

// Every persisted row for the current subject, including ones hidden (`present: false`) because
// the model no longer declares that path — callers filter those out for display.
export function useTestRows(testCases: TestCasesService): TestRow[] {
  return useSyncExternalStore(testCases.subscribe, () => testCases.listRows());
}
