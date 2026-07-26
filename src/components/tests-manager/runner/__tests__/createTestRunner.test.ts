import 'fake-indexeddb/auto';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { describe, expect, it } from 'vitest';
import { createTestCasesService } from '../../../test-cases-service';
import type { TestCasesService } from '../../../test-cases-service';
import { deriveRows } from '../../model/rows';
import type { MutableDecisionService as RunnerService, TestSubject } from '../../tests-manager-types';
import { createTestRunner } from '../createTestRunner';

function uniqueDbName(): string {
  return `runner-${Math.random().toString(36).slice(2)}`;
}

function waitForHydration(service: TestCasesService): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = service.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
}

const WORKBOOK_MODEL = `{
    maxLimit: 10000,
    name: <string, required: true>,
    age: <number, required: true>,
    credit: {
        balance: <number, required: true>,
        limit: <number, required: true>
    },
    creditDecision: {
        approved: if credit.balance >= 0 and age > 17 then true else false,
        limit: if approved then maxLimit else 0
    }
}`;

const MODEL_SUBJECT: TestSubject = { id: '*', kind: 'model', name: 'Model' };

async function setUpWorkbook(): Promise<{ service: RunnerService; testCasesService: TestCasesService }> {
  const service = MutableDecisionService.fromCode(WORKBOOK_MODEL) as unknown as RunnerService;
  const testCasesService = createTestCasesService('model', '*', { dbName: uniqueDbName() });
  await waitForHydration(testCasesService);
  testCasesService.syncRows(deriveRows(service, MODEL_SUBJECT));
  return { service, testCasesService };
}

describe('createTestRunner — binding', () => {
  it('binds nested dotted input paths and writes a successful result set', async () => {
    const { service, testCasesService } = await setUpWorkbook();
    const testCase = testCasesService.addTestCase();
    testCasesService.setCell(testCase.id, 'name', 'input', 'Steve');
    testCasesService.setCell(testCase.id, 'age', 'input', '30');
    testCasesService.setCell(testCase.id, 'credit.balance', 'input', '1000');
    testCasesService.setCell(testCase.id, 'credit.limit', 'input', '2000');

    const runner = createTestRunner(service, testCasesService, MODEL_SUBJECT);
    await runner.run(testCase.id);

    const resultSet = testCasesService.getResultSet(testCase.id);
    expect(resultSet?.status).toBe('ok');
    expect(resultSet?.results['creditDecision.approved'].value).toBe(true);
    expect(resultSet?.results['creditDecision.limit'].value).toBe(10000);
    expect(resultSet?.results.maxLimit.value).toBe(10000);
    expect(resultSet?.ranAt).toBeGreaterThan(0);
    testCasesService.dispose();
  });

  it('leaves an empty input cell unbound, letting the engine apply its own default/Invalid', async () => {
    const { service, testCasesService } = await setUpWorkbook();
    const testCase = testCasesService.addTestCase();
    testCasesService.setCell(testCase.id, 'name', 'input', 'Steve');
    testCasesService.setCell(testCase.id, 'credit.balance', 'input', '1000');
    testCasesService.setCell(testCase.id, 'credit.limit', 'input', '2000');
    // 'age' is left empty — required, with no default.

    const runner = createTestRunner(service, testCasesService, MODEL_SUBJECT);
    await runner.run(testCase.id);

    const resultSet = testCasesService.getResultSet(testCase.id);
    expect(resultSet?.status).toBe('ok');
    expect(String(resultSet?.results.age.value)).toMatch(/Invalid/);
    expect(resultSet?.results['creditDecision.approved'].value).toBe(false);
    testCasesService.dispose();
  });

  it('stamps modelRevision from the options passed to the factory', async () => {
    const { service, testCasesService } = await setUpWorkbook();
    const testCase = testCasesService.addTestCase();
    testCasesService.setCell(testCase.id, 'credit.balance', 'input', '1000');
    testCasesService.setCell(testCase.id, 'credit.limit', 'input', '2000');

    const runner = createTestRunner(service, testCasesService, MODEL_SUBJECT, { modelRevision: 'rev-1' });
    await runner.run(testCase.id);

    expect(testCasesService.getResultSet(testCase.id)?.modelRevision).toBe('rev-1');
    testCasesService.dispose();
  });
});

describe('createTestRunner — result flattening', () => {
  it('flattens a scalar-returning callable to the single empty path', async () => {
    const service = MutableDecisionService.fromCode(
      '{ func isEligible(age: number): age >= 18 }',
    ) as unknown as RunnerService;
    const testCasesService = createTestCasesService('model', 'isEligible', { dbName: uniqueDbName() });
    await waitForHydration(testCasesService);
    const subject: TestSubject = { id: 'isEligible', kind: 'function', name: 'isEligible' };
    testCasesService.syncRows(deriveRows(service, subject));
    const testCase = testCasesService.addTestCase();
    testCasesService.setCell(testCase.id, 'age', 'input', '20');

    const runner = createTestRunner(service, testCasesService, subject);
    await runner.run(testCase.id);

    expect(testCasesService.getResultSet(testCase.id)?.results[''].value).toBe(true);
    testCasesService.dispose();
  });

  it('reconciles call-site leaves an invocation hides from every schema view into new validations rows', async () => {
    const service = MutableDecisionService.fromCode(`{
      optimise factoryProduction(workers: number, sticks: number, plates: number): {
        variables: { chairs: <number, integer: true, min: 0>, tables: <number, integer: true, min: 0> }
        maximise: 15 * chairs + 40 * tables
        constraints: {
          workerCapacity: 1 * chairs + 3 * tables <= workers
          stickSupply: 4 * chairs + 4 * tables <= sticks
          plateSupply: 1 * chairs + 2 * tables <= plates
        }
      }
      plan: factoryProduction(workers: 8, sticks: 40, plates: 12)
    }`) as unknown as RunnerService;
    (service as unknown as { registerSolver: (h: (p: unknown) => unknown) => void }).registerSolver(() => ({
      status: 'optimal',
      objective: 120,
      values: { chairs: 8, tables: 0 },
    }));

    const testCasesService = createTestCasesService('model', '*', { dbName: uniqueDbName() });
    await waitForHydration(testCasesService);
    testCasesService.syncRows(deriveRows(service, MODEL_SUBJECT));
    expect(testCasesService.listRows().some((r) => r.path.startsWith('plan'))).toBe(false);

    const testCase = testCasesService.addTestCase();
    const runner = createTestRunner(service, testCasesService, MODEL_SUBJECT);
    await runner.run(testCase.id);

    const rows = testCasesService.listRows();
    expect(rows.find((r) => r.path === 'plan.status')?.section).toBe('validations');
    expect(rows.find((r) => r.path === 'plan.chairs')).toBeTruthy();

    const resultSet = testCasesService.getResultSet(testCase.id);
    expect(resultSet?.status).toBe('ok');
    expect(resultSet?.results['plan.status'].value).toBe('optimal');
    expect(resultSet?.results['plan.chairs'].value).toBe(8);
    testCasesService.dispose();
  });
});

describe('createTestRunner — run-level failures', () => {
  it('records a run-level PortableError with no per-path results', async () => {
    const service = MutableDecisionService.fromCode('{ func f(x: number): x + 1 }');
    const testCasesService = createTestCasesService('model', 'f', { dbName: uniqueDbName() });
    await waitForHydration(testCasesService);
    const subject: TestSubject = { id: 'f', kind: 'function', name: 'f' };
    testCasesService.syncRows(deriveRows(service as unknown as RunnerService, subject));
    const testCase = testCasesService.addTestCase();
    testCasesService.setCell(testCase.id, 'x', 'input', '1');

    service.remove('f');

    const runner = createTestRunner(service as unknown as RunnerService, testCasesService, subject);
    await runner.run(testCase.id);

    const resultSet = testCasesService.getResultSet(testCase.id);
    expect(resultSet?.status).toBe('error');
    expect(resultSet?.results).toEqual({});
    expect(resultSet?.error).toBeTruthy();
    testCasesService.dispose();
  });
});

describe('createTestRunner — missing-solver pre-flight', () => {
  it('refuses the run with a run-level error when the model needs a solver and none is registered', async () => {
    const service = MutableDecisionService.fromCode(`{
      optimise plan(cap: number): {
        variables: { x: <number, min: 0> }
        maximise: x
        constraints: { capC: x <= cap }
      }
    }`) as unknown as RunnerService;
    const testCasesService = createTestCasesService('model', 'plan', { dbName: uniqueDbName() });
    await waitForHydration(testCasesService);
    const subject: TestSubject = { id: 'plan', kind: 'optimise', name: 'plan' };
    testCasesService.syncRows(deriveRows(service, subject));
    const testCase = testCasesService.addTestCase();
    testCasesService.setCell(testCase.id, 'cap', 'input', '10');

    const runner = createTestRunner(service, testCasesService, subject);
    await runner.run(testCase.id);

    const resultSet = testCasesService.getResultSet(testCase.id);
    expect(resultSet?.status).toBe('error');
    expect(resultSet?.error).toMatch(/solver/i);
    expect(resultSet?.results).toEqual({});
    testCasesService.dispose();
  });

  it('runs normally via a registerSolver stub once one is registered', async () => {
    const service = MutableDecisionService.fromCode(`{
      optimise plan(cap: number): {
        variables: { x: <number, min: 0> }
        maximise: x
        constraints: { capC: x <= cap }
      }
    }`);
    (service as unknown as { registerSolver: (h: (p: unknown) => unknown) => void }).registerSolver(() => ({
      status: 'optimal',
      objective: 10,
      values: { x: 10 },
    }));

    const testCasesService = createTestCasesService('model', 'plan', { dbName: uniqueDbName() });
    await waitForHydration(testCasesService);
    const subject: TestSubject = { id: 'plan', kind: 'optimise', name: 'plan' };
    testCasesService.syncRows(deriveRows(service as unknown as RunnerService, subject));
    const testCase = testCasesService.addTestCase();
    testCasesService.setCell(testCase.id, 'cap', 'input', '10');

    const runner = createTestRunner(service as unknown as RunnerService, testCasesService, subject);
    await runner.run(testCase.id);

    const resultSet = testCasesService.getResultSet(testCase.id);
    expect(resultSet?.status).toBe('ok');
    expect(resultSet?.results.status.value).toBe('optimal');
    expect(resultSet?.results.objective.value).toBe(10);
    expect(resultSet?.results.x.value).toBe(10);
    testCasesService.dispose();
  });
});

describe('createTestRunner — run serialization', () => {
  it('a run requested mid-flight supersedes the queued one for the same case', async () => {
    const { service, testCasesService } = await setUpWorkbook();
    const testCase = testCasesService.addTestCase();
    testCasesService.setCell(testCase.id, 'credit.balance', 'input', '1000');
    testCasesService.setCell(testCase.id, 'credit.limit', 'input', '2000');
    testCasesService.setCell(testCase.id, 'age', 'input', '10');

    const runner = createTestRunner(service, testCasesService, MODEL_SUBJECT);
    const first = runner.run(testCase.id);
    testCasesService.setCell(testCase.id, 'age', 'input', '30');
    const second = runner.run(testCase.id);
    await Promise.all([first, second]);

    // Only the second run's outcome survives — age 30 makes the applicant eligible.
    const resultSet = testCasesService.getResultSet(testCase.id);
    expect(resultSet?.results['creditDecision.approved'].value).toBe(true);
    expect(runner.getRunning()).toEqual([]);
    testCasesService.dispose();
  });
});
