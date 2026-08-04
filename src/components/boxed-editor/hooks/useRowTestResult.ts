import { useCallback, useSyncExternalStore } from 'react';
import type { TestResult } from '../../test-cases-service';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import { useBoxedEditorTestContext } from '../context/BoxedEditorTestContext';
import { unqualifyPath } from '../service/portable-utils';

export interface RowTestResultState {
  result: TestResult | undefined;
  /** A run for the selected case is in flight. */
  pending: boolean;
  /** The selected case's result set predates the model's current revision. */
  stale: boolean;
}

const subscribeNever = (): (() => void) => () => {};

/**
 * `path` is a `BoxedRowData`'s fully qualified, model-wide address; `TestResultSet.results` is
 * keyed subject-relative, so this un-qualifies it against `testSubjectId` (inverse of
 * `test-cases-service`'s `qualifyPath`) before reading the selected case's value for this row
 * (Section 5/6).
 */
export function useRowTestResult(path: string): RowTestResultState {
  const { testCasesService, testSubjectId } = useBoxedEditorContext();
  const { currentCase, running, stale } = useBoxedEditorTestContext();
  const testCaseId = currentCase?.id;
  const relativePath = unqualifyPath(testSubjectId ?? '*', path);

  const getSnapshot = useCallback((): TestResult | undefined => {
    if (!testCasesService || testCaseId === undefined || relativePath === undefined) return undefined;
    return testCasesService.getResultSet(testCaseId)?.results[relativePath];
  }, [testCasesService, testCaseId, relativePath]);

  const result = useSyncExternalStore(testCasesService?.subscribe ?? subscribeNever, getSnapshot);

  return {
    result,
    pending: testCaseId !== undefined && running.includes(testCaseId),
    stale,
  };
}
