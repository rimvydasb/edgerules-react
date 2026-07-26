import 'fake-indexeddb/auto';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestCasesService } from '../createTestCasesService';
import type { TestCasesService } from '../test-cases-service-types';
import { useTestCases } from '../useTestCases';
import { useTestResult } from '../useTestResult';

function uniqueDbName(): string {
  return `hooks-${Math.random().toString(36).slice(2)}`;
}

function waitForHydration(service: TestCasesService): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = service.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
}

function TestCasesProbe({ service }: { service: TestCasesService }) {
  const { cases, current, next, prev } = useTestCases(service);
  return (
    <div>
      <span data-testid="count">{cases.length}</span>
      <span data-testid="current">{current?.name ?? 'none'}</span>
      <button onClick={next}>next</button>
      <button onClick={prev}>prev</button>
    </div>
  );
}

function ResultProbe({
  service,
  testCaseId,
  path,
}: {
  service: TestCasesService;
  testCaseId: string;
  path: string;
}) {
  const result = useTestResult(service, testCaseId, path);
  return (
    <span data-testid="value">{result ? String(result.value) : 'none'}</span>
  );
}

describe('useTestCases', () => {
  it('re-renders when the service writes, and unsubscribes on unmount', async () => {
    const service = createTestCasesService('model', '*', {
      dbName: uniqueDbName(),
    });
    await waitForHydration(service);
    act(() => {
      service.addTestCase('A');
    });

    const { unmount } = render(<TestCasesProbe service={service} />);
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('current').textContent).toBe('A');

    act(() => {
      service.addTestCase('B');
    });
    expect(screen.getByTestId('count').textContent).toBe('2');

    unmount();
    // A write after unmount must not throw even though the component stopped listening.
    expect(() => service.addTestCase('C')).not.toThrow();
    service.dispose();
  });
});

describe('useTestResult', () => {
  it('reflects a saved result and clears when the result set is cleared', async () => {
    const service = createTestCasesService('model', '*', {
      dbName: uniqueDbName(),
    });
    await waitForHydration(service);
    const testCase = service.addTestCase();

    render(
      <ResultProbe service={service} testCaseId={testCase.id} path="age" />,
    );
    expect(screen.getByTestId('value').textContent).toBe('none');

    act(() => {
      service.saveResultSet({
        testCaseId: testCase.id,
        ranAt: 1,
        status: 'ok',
        results: { age: { path: 'age', value: 30, status: 'ok' } },
      });
    });
    expect(screen.getByTestId('value').textContent).toBe('30');

    act(() => {
      service.clearResultSet(testCase.id);
    });
    expect(screen.getByTestId('value').textContent).toBe('none');

    service.dispose();
  });
});
