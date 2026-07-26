import { isPortableError } from '../../../lib/portable';
import type { TestCasesService, TestResult, TestRow } from '../../test-cases-service';
import { buildExecuteInput } from '../model/inputs';
import { flattenResult } from '../model/rows';
import { CellParseError, parseCell } from '../model/values';
import type { MutableDecisionService, TestRunner, TestSubject } from '../tests-manager-types';

function errorMessage(thrown: unknown): string {
  if (isPortableError(thrown)) return thrown.message;
  if (thrown instanceof Error) return thrown.message;
  return String(thrown);
}

function missingSolverMessage(subject: TestSubject): string {
  return subject.kind === 'optimise'
    ? `No optimisation solver registered for '${subject.id}'.`
    : 'No optimisation solver registered for this model.';
}

// A lightweight type name for a row discovered from a run result rather than the schema — good
// enough for `parseCell`/`formatValue` to treat it sensibly; the schema never described it.
function inferRuntimeType(value: unknown): string | undefined {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) return 'array';
  return undefined;
}

export function createTestRunner(
  service: MutableDecisionService,
  testCases: TestCasesService,
  subject: TestSubject,
  options?: { modelRevision?: string },
): TestRunner {
  const modelRevision = options?.modelRevision !== undefined ? String(options.modelRevision) : undefined;
  const running = new Set<string>();
  const generations = new Map<string, number>();
  const listeners = new Set<() => void>();

  // `useSyncExternalStore(runner.subscribe, runner.getRunning)` requires a referentially stable
  // snapshot between notifications — see the identical comment in `createTestCasesService.ts`.
  let version = 0;
  let runningCacheVersion = -1;
  let runningCache: readonly string[] = [];

  function notify(): void {
    version += 1;
    for (const listener of listeners) listener();
  }

  function isCurrent(testCaseId: string, generation: number): boolean {
    return generations.get(testCaseId) === generation;
  }

  function saveError(testCaseId: string, message: string): void {
    testCases.saveResultSet({
      testCaseId,
      ranAt: Date.now(),
      modelRevision,
      status: 'error',
      error: message,
      results: {},
    });
  }

  // Reconciles any path the schema never revealed (an opaque `@kind: 'invocation'` call site) into
  // `validations`, by passing every currently known row back unchanged alongside the newly
  // discovered ones — `TestCasesService.syncRows` only ever drops what is missing from this set.
  function reconcileDiscoveredRows(flattened: Record<string, unknown>): TestRow[] {
    const knownRows = testCases.listRows();
    const knownPaths = new Set(knownRows.map((row) => row.path));
    const discovered: TestRow[] = [];
    for (const [path, value] of Object.entries(flattened)) {
      if (knownPaths.has(path)) continue;
      discovered.push({ path, section: 'validations', order: 0, type: inferRuntimeType(value), present: true });
    }
    if (discovered.length === 0) return knownRows;
    testCases.syncRows([...knownRows, ...discovered]);
    return testCases.listRows();
  }

  async function performRun(testCaseId: string, generation: number): Promise<void> {
    if (service.requiresSolver() && service.solverHandler === undefined) {
      if (!isCurrent(testCaseId, generation)) return;
      saveError(testCaseId, missingSolverMessage(subject));
      return;
    }

    const inputRows = testCases.listRows().filter((row) => row.present && row.section === 'inputs');
    const valuesByPath: Record<string, unknown> = {};
    for (const row of inputRows) {
      const text = testCases.getCell(testCaseId, row.path, 'input');
      if (text === undefined || text === '') continue;
      try {
        valuesByPath[row.path] = parseCell(text, row.type);
      } catch (thrown) {
        if (!isCurrent(testCaseId, generation)) return;
        const detail = thrown instanceof CellParseError ? thrown.message : errorMessage(thrown);
        saveError(testCaseId, `Invalid value for '${row.path}': ${detail}`);
        return;
      }
    }

    let rawResult: unknown;
    try {
      rawResult = await service.execute(subject.id, buildExecuteInput(valuesByPath));
    } catch (thrown) {
      if (!isCurrent(testCaseId, generation)) return;
      saveError(testCaseId, errorMessage(thrown));
      return;
    }

    if (!isCurrent(testCaseId, generation)) return;

    const flattened = flattenResult(rawResult);
    const rows = reconcileDiscoveredRows(flattened);

    const results: Record<string, TestResult> = {};
    for (const row of rows) {
      if (!row.present) continue;
      if (Object.prototype.hasOwnProperty.call(flattened, row.path)) {
        results[row.path] = { path: row.path, value: flattened[row.path], status: 'ok' };
      }
    }

    testCases.saveResultSet({ testCaseId, ranAt: Date.now(), modelRevision, status: 'ok', results });
  }

  async function run(testCaseId: string): Promise<void> {
    const generation = (generations.get(testCaseId) ?? 0) + 1;
    generations.set(testCaseId, generation);
    running.add(testCaseId);
    notify();
    try {
      await performRun(testCaseId, generation);
    } finally {
      if (isCurrent(testCaseId, generation)) {
        running.delete(testCaseId);
        notify();
      }
    }
  }

  async function runAll(): Promise<void> {
    for (const testCase of testCases.listTestCases()) {
      await run(testCase.id);
    }
  }

  return {
    run,
    runAll,
    getRunning: () => {
      if (runningCacheVersion !== version) {
        runningCache = [...running];
        runningCacheVersion = version;
      }
      return runningCache;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
