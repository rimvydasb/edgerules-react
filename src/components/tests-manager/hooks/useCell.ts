import { useSyncExternalStore } from 'react';
import type { TestCasesService, TestCellKind, TestResult, TestResultSet, TestRow } from '../../test-cases-service';
import { matches } from '../model/values';

function useResultInfo(
  testCases: TestCasesService,
  testCaseId: string,
  path: string,
  revision: string | number | undefined,
): { result: TestResult | undefined; resultSet: TestResultSet | undefined; isStale: boolean } {
  const resultSet = useSyncExternalStore(testCases.subscribe, () => testCases.getResultSet(testCaseId));
  const result = resultSet?.results[path];
  const currentRevision = revision === undefined ? undefined : String(revision);
  const isStale = resultSet !== undefined && resultSet.modelRevision !== currentRevision;
  return { result, resultSet, isStale };
}

export interface UseCellResult {
  text: string;
  result: TestResult | undefined;
  isStale: boolean;
  // Only meaningful for an assertion cell; `undefined` for an input cell or a stale result.
  isMatch: boolean | undefined;
  setText: (text: string) => void;
}

// One cell's persisted text, its path's current computed value, and — for an assertion cell —
// whether the expected text matches it. A stale result never reports a match either way.
export function useCell(
  testCases: TestCasesService,
  testCaseId: string,
  row: TestRow,
  kind: TestCellKind,
  revision: string | number | undefined,
): UseCellResult {
  const text = useSyncExternalStore(testCases.subscribe, () => testCases.getCell(testCaseId, row.path, kind) ?? '');
  const { result, isStale } = useResultInfo(testCases, testCaseId, row.path, revision);
  const isMatch = kind === 'assertion' && !isStale ? matches(text, result?.value, row.type) : undefined;

  return {
    text,
    result,
    isStale,
    isMatch,
    setText: (nextText: string) => testCases.setCell(testCaseId, row.path, kind, nextText),
  };
}

// Read-only variant for `ValidationCell`, which has no persisted text of its own to read or write.
export function useResult(
  testCases: TestCasesService,
  testCaseId: string,
  row: TestRow,
  revision: string | number | undefined,
): { result: TestResult | undefined; isStale: boolean } {
  const { result, isStale } = useResultInfo(testCases, testCaseId, row.path, revision);
  return { result, isStale };
}
