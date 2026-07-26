import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { TestCase, TestCasesService } from './test-cases-service-types';

export interface UseTestCasesResult {
  cases: TestCase[];
  currentIndex: number;
  current: TestCase | undefined;
  setCurrentIndex: (index: number) => void;
  next: () => void;
  prev: () => void;
}

// Ordered test cases for `service`, plus a locally-owned "current" index for host UIs that page
// through cases one at a time (e.g. `BoxedEditor`'s `TestResultsColumn`). The index clamps to the
// live case count on every render, so removing the current (or a preceding) case never leaves it
// pointing past the end or at a stale case.
export function useTestCases(service: TestCasesService): UseTestCasesResult {
  const cases = useSyncExternalStore(service.subscribe, () => service.listTestCases());
  const [rawIndex, setRawIndex] = useState(0);
  const currentIndex = cases.length === 0 ? 0 : Math.min(rawIndex, cases.length - 1);

  const setCurrentIndex = useCallback(
    (index: number) => {
      setRawIndex(Math.max(0, Math.min(index, Math.max(cases.length - 1, 0))));
    },
    [cases.length],
  );

  const next = useCallback(() => {
    setCurrentIndex(currentIndex + 1);
  }, [currentIndex, setCurrentIndex]);

  const prev = useCallback(() => {
    setCurrentIndex(currentIndex - 1);
  }, [currentIndex, setCurrentIndex]);

  return useMemo(
    () => ({
      cases,
      currentIndex,
      current: cases[currentIndex],
      setCurrentIndex,
      next,
      prev,
    }),
    [cases, currentIndex, setCurrentIndex, next, prev],
  );
}
