import { useMemo, useSyncExternalStore } from 'react';
import type { TestCase, TestCasesService } from '../../test-cases-service';
import { useTestsManagerUiContext } from '../context/TestsManagerUiContext';

export interface UseTestCaseColumnsResult {
  allCases: TestCase[];
  visibleCases: TestCase[];
  pageIndex: number;
  pageCount: number;
  setPageIndex: (index: number) => void;
  nextPage: () => void;
  prevPage: () => void;
}

// The visible page of test-case columns plus the paging controls that drive it. The Path and
// Description columns are frozen and never page — only test-case columns do.
export function useTestCaseColumns(testCases: TestCasesService, pageSize: number): UseTestCaseColumnsResult {
  const allCases = useSyncExternalStore(testCases.subscribe, () => testCases.listTestCases());
  const { pageIndex: rawPageIndex, setPageIndex } = useTestsManagerUiContext();
  const pageCount = Math.max(1, Math.ceil(allCases.length / pageSize));
  const pageIndex = Math.min(rawPageIndex, pageCount - 1);
  const visibleCases = useMemo(
    () => allCases.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize),
    [allCases, pageIndex, pageSize],
  );

  return {
    allCases,
    visibleCases,
    pageIndex,
    pageCount,
    setPageIndex,
    nextPage: () => setPageIndex(Math.min(pageIndex + 1, pageCount - 1)),
    prevPage: () => setPageIndex(Math.max(pageIndex - 1, 0)),
  };
}
