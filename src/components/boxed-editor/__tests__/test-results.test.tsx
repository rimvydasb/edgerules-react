import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MutableDecisionService } from '@edgerules/node/mutable';
import type { ReactNode } from 'react';
import { BoxedEditor } from '../BoxedEditor';
import { createBoxedEditorService } from '../service/createBoxedEditorService';
import { BoxedEditorProvider } from '../context/BoxedEditorContext';
import { BoxedEditorTestProvider, useBoxedEditorTestContext } from '../context/BoxedEditorTestContext';
import { useRowCommands } from '../commands/useRowCommands';
import { createDocumentationService } from '../../documentation-service';
import { createTestCasesService } from '../../test-cases-service';
import type { TestCasesService, TestRow } from '../../test-cases-service';
import { createTestRunner } from '../../tests-manager';
import type { MutableDecisionService as RunnerService, TestRunner, TestSubject } from '../../tests-manager';

const MODEL_SUBJECT: TestSubject = { id: '*', kind: 'model', name: 'Model' };

function uniqueDbName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function waitForHydration(service: TestCasesService): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = service.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
}

function inputRow(path: string, type = 'number'): TestRow {
  return { path, section: 'inputs', order: 0, type, present: true };
}

/** A hand-written `TestRunner` double whose `run` never resolves until the test calls `resolve` —
 * lets the "pending" cell state (Section 8) be observed deterministically, which the real engine's
 * near-instant execution otherwise makes a race. */
function createControllableRunner(): { runner: TestRunner; resolve: () => void } {
  const listeners = new Set<() => void>();
  let running: string[] = [];
  let finish: (() => void) | undefined;

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const runner: TestRunner = {
    run(testCaseId: string) {
      running = [testCaseId];
      notify();
      return new Promise<void>((resolvePromise) => {
        finish = () => {
          running = [];
          notify();
          resolvePromise();
        };
      });
    },
    async runAll() {},
    getRunning: () => running,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return { runner, resolve: () => finish?.() };
}

describe('test-results: triggers', () => {
  it('debounces and coalesces a burst of commits into one re-run of the selected case', async () => {
    const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
    const service = createBoxedEditorService(mutable);
    const testCasesService = createTestCasesService('model', '*', { dbName: uniqueDbName('debounce') });
    await waitForHydration(testCasesService);
    testCasesService.syncRows([inputRow('amount')]);
    testCasesService.addTestCase();
    const runner = createTestRunner(mutable as unknown as RunnerService, testCasesService, MODEL_SUBJECT, {
      modelRevision: 'rev-0',
    });
    const runSpy = vi.spyOn(runner, 'run');

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <BoxedEditorProvider
          service={service}
          readOnly={false}
          showDescription
          showTestResults
          showType
          autoRunTests
          testCasesService={testCasesService}
          testRunner={runner}
          testSubjectId="*"
          revision="rev-0"
        >
          <BoxedEditorTestProvider>{children}</BoxedEditorTestProvider>
        </BoxedEditorProvider>
      );
    }

    const { result } = renderHook(() => useRowCommands(), { wrapper: Wrapper });

    // Mount: no result set yet — an immediate freshness-gated run (Triggers: "Mount").
    await waitFor(() => expect(runSpy).toHaveBeenCalledTimes(1));
    runSpy.mockClear();

    act(() => {
      const row = service.getBoxedRowData('amount')!;
      result.current.setBoxedRowData('amount', { ...row, value: '11' });
      result.current.setBoxedRowData('amount', { ...row, value: '12' });
      result.current.setBoxedRowData('amount', { ...row, value: '13' });
    });

    // Still within the 300 ms debounce window.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(runSpy).not.toHaveBeenCalled();

    await waitFor(() => expect(runSpy).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(mutable.toPortable()).toMatchObject({ amount: 13 });

    testCasesService.dispose();
  });

  it('never runs when autoRunTests is false', async () => {
    const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
    const service = createBoxedEditorService(mutable);
    const testCasesService = createTestCasesService('model', '*', { dbName: uniqueDbName('no-auto-run') });
    await waitForHydration(testCasesService);
    testCasesService.syncRows([inputRow('amount')]);
    testCasesService.addTestCase();
    const runner = createTestRunner(mutable as unknown as RunnerService, testCasesService, MODEL_SUBJECT);
    const runSpy = vi.spyOn(runner, 'run');

    render(
      <BoxedEditor
        service={service}
        path="*"
        testCasesService={testCasesService}
        testRunner={runner}
        testSubjectId="*"
        autoRunTests={false}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runSpy).not.toHaveBeenCalled();

    testCasesService.dispose();
  });

  it('re-runs on case navigation only when the target case has no fresh result set', async () => {
    const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
    const service = createBoxedEditorService(mutable);
    const testCasesService = createTestCasesService('model', '*', { dbName: uniqueDbName('nav') });
    await waitForHydration(testCasesService);
    testCasesService.syncRows([inputRow('amount')]);
    const caseA = testCasesService.addTestCase('A');
    const caseB = testCasesService.addTestCase('B');
    const runner = createTestRunner(mutable as unknown as RunnerService, testCasesService, MODEL_SUBJECT, {
      modelRevision: 'rev-0',
    });
    const runSpy = vi.spyOn(runner, 'run');

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <BoxedEditorProvider
          service={service}
          readOnly={false}
          showDescription
          showTestResults
          showType
          autoRunTests
          testCasesService={testCasesService}
          testRunner={runner}
          testSubjectId="*"
          revision="rev-0"
        >
          <BoxedEditorTestProvider>{children}</BoxedEditorTestProvider>
        </BoxedEditorProvider>
      );
    }

    const { result } = renderHook(() => useBoxedEditorTestContext(), { wrapper: Wrapper });

    // Mount runs case A (no result set yet).
    await waitFor(() => expect(runSpy).toHaveBeenCalledTimes(1));
    expect(runSpy).toHaveBeenLastCalledWith(caseA.id);
    runSpy.mockClear();

    // Case B has no result set either — switching to it must run it.
    act(() => result.current.next());
    await waitFor(() => expect(runSpy).toHaveBeenCalledTimes(1));
    expect(runSpy).toHaveBeenLastCalledWith(caseB.id);
    runSpy.mockClear();

    // Back to A — its result set is fresh (matches the current revision) — no re-run.
    act(() => result.current.prev());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runSpy).not.toHaveBeenCalled();

    testCasesService.dispose();
  });
});

describe('test-results: rendering', () => {
  it('renders a pending placeholder while the selected case is running', async () => {
    const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
    const service = createBoxedEditorService(mutable);
    const testCasesService = createTestCasesService('model', '*', { dbName: uniqueDbName('pending') });
    await waitForHydration(testCasesService);
    testCasesService.syncRows([inputRow('amount')]);
    testCasesService.addTestCase();
    const { runner, resolve } = createControllableRunner();

    render(
      <BoxedEditor
        service={service}
        path="*"
        testCasesService={testCasesService}
        testRunner={runner}
        testSubjectId="*"
        revision="rev-0"
      />,
    );

    // Mount triggers the freshness-gated run; the fake runner never resolves until told to.
    const row = screen.getByTestId('row-amount');
    await waitFor(() =>
      expect(row.querySelector('[data-column="test-results"]')?.textContent).toBe('…'),
    );

    act(() => resolve());
    await waitFor(() =>
      expect(row.querySelector('[data-column="test-results"]')?.textContent).toBe(''),
    );

    testCasesService.dispose();
  });

  it('renders a stale result muted and italic without an autoRunTests re-run', async () => {
    const mutable = MutableDecisionService.fromCode('{ amount: 42 }');
    const service = createBoxedEditorService(mutable);
    const testCasesService = createTestCasesService('model', '*', { dbName: uniqueDbName('stale') });
    await waitForHydration(testCasesService);
    testCasesService.syncRows([inputRow('amount')]);
    const testCase = testCasesService.addTestCase();
    testCasesService.saveResultSet({
      testCaseId: testCase.id,
      ranAt: Date.now(),
      modelRevision: 'rev-0',
      status: 'ok',
      results: { amount: { path: 'amount', value: 999, status: 'ok' } },
    });

    render(
      <BoxedEditor
        service={service}
        path="*"
        testCasesService={testCasesService}
        testSubjectId="*"
        revision="rev-1"
        autoRunTests={false}
      />,
    );

    const value = await screen.findByText('999');
    expect(value).toHaveStyle({ fontStyle: 'italic' });

    testCasesService.dispose();
  });

  it('shows the run-level error as a chip in the header when the run itself fails', async () => {
    const mutable = MutableDecisionService.fromCode('{ amount: <number, required: true> }');
    const service = createBoxedEditorService(mutable);
    const testCasesService = createTestCasesService('model', '*', { dbName: uniqueDbName('run-error') });
    await waitForHydration(testCasesService);
    testCasesService.syncRows([inputRow('amount')]);
    const testCase = testCasesService.addTestCase();
    // Unparseable for a `number` row — a real `CellParseError`, not a mocked failure.
    testCasesService.setCell(testCase.id, 'amount', 'input', 'not-a-number');
    const runner = createTestRunner(mutable as unknown as RunnerService, testCasesService, MODEL_SUBJECT);

    render(
      <BoxedEditor
        service={service}
        path="*"
        testCasesService={testCasesService}
        testRunner={runner}
        testSubjectId="*"
      />,
    );

    expect(await screen.findByLabelText('Run error')).toBeInTheDocument();
    expect(testCasesService.getResultSet(testCase.id)?.status).toBe('error');

    testCasesService.dispose();
  });

  it('formats every value kind per the Result formatting table, and reads via the subject-relative path', async () => {
    const mutable = MutableDecisionService.fromCode(`{
      creditDecision: {
        n: 0
        b: false
        s: ''
        arr: []
        obj: { }
        skipped: 0
      }
    }`);
    const service = createBoxedEditorService(mutable);
    const testCasesService = createTestCasesService('model', 'creditDecision', {
      dbName: uniqueDbName('formatting'),
    });
    await waitForHydration(testCasesService);
    testCasesService.syncRows([
      inputRow('n'),
      inputRow('b', 'boolean'),
      inputRow('s', 'string'),
      inputRow('arr', 'array'),
      inputRow('obj', 'any'),
      inputRow('skipped'),
    ]);
    const testCase = testCasesService.addTestCase();
    // Keyed subject-relative ('n', not 'creditDecision.n') — `useRowTestResult` un-qualifies the
    // row's fully qualified path against `testSubjectId` before this same lookup.
    testCasesService.saveResultSet({
      testCaseId: testCase.id,
      ranAt: Date.now(),
      modelRevision: 'rev-0',
      status: 'ok',
      results: {
        n: { path: 'n', value: 1234, status: 'ok' },
        b: { path: 'b', value: true, status: 'ok' },
        s: { path: 's', value: 'hello world', status: 'ok' },
        arr: { path: 'arr', value: [1, 2, 3], status: 'ok' },
        obj: { path: 'obj', value: { x: 1 }, status: 'ok' },
        // 'skipped' deliberately has no entry — "no result / not yet run" renders empty.
      },
    });

    render(
      <BoxedEditor
        service={service}
        path="creditDecision"
        testCasesService={testCasesService}
        testSubjectId="creditDecision"
        revision="rev-0"
        autoRunTests={false}
      />,
    );

    expect(await screen.findByText((1234).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByText('{…}')).toBeInTheDocument();

    const skippedRow = screen.getByTestId('row-creditDecision.skipped');
    expect(skippedRow.querySelector('[data-column="test-results"]')?.textContent).toBe('');

    testCasesService.dispose();
  });
});

describe('description column', () => {
  it('commits an edit through DocumentationService and reflects it on remount from the same service', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
    const documentationService = createDocumentationService('model', {
      dbName: uniqueDbName('description'),
    });
    await new Promise<void>((resolve) => {
      const unsubscribe = documentationService.subscribe(() => {
        unsubscribe();
        resolve();
      });
    });

    const { unmount } = render(
      <BoxedEditor
        service={createBoxedEditorService(mutable)}
        path="*"
        documentationService={documentationService}
      />,
    );

    const input = screen.getByLabelText('description amount');
    await user.click(input);
    await user.keyboard('Loan principal');
    await user.tab();

    expect(documentationService.getDescription('amount')).toBe('Loan principal');
    unmount();

    render(
      <BoxedEditor
        service={createBoxedEditorService(MutableDecisionService.fromCode('{ amount: 10 }'))}
        path="*"
        documentationService={documentationService}
      />,
    );
    expect(screen.getByLabelText('description amount')).toHaveValue('Loan principal');

    documentationService.dispose();
  });

  it('renders empty and read-only when no documentationService is provided', () => {
    const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
    render(<BoxedEditor service={createBoxedEditorService(mutable)} path="*" />);

    const input = screen.getByLabelText('description amount') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.disabled).toBe(true);
  });
});
