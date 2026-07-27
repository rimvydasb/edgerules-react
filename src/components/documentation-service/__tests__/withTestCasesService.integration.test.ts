// Demonstrates DocumentationService used alongside test-cases-service on the same model, per
// DOCUMENTATION_SERVICE_STORY.md's Resolved Decision #8: the two overlays are decoupled — neither
// package imports the other — but a host (e.g. BoxedEditor) attaches both to the same paths. This
// test writes a few descriptions for paths that also carry test cases, disposes both services, and
// re-creates fresh instances to confirm every description persisted to IndexedDB independently of
// the test-cases-service data living alongside it.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDocumentationService } from '../createDocumentationService';
import type { DocumentationService } from '../documentation-service-types';
import { createTestCasesService } from '../../test-cases-service/createTestCasesService';
import type { TestCasesService, TestRow } from '../../test-cases-service/test-cases-service-types';

function waitForHydration(service: DocumentationService | TestCasesService): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = service.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
}

// Background persistence has no public "flush" — poll a fresh instance against the same dbName
// until it observes the expected state, rather than guessing a fixed number of event-loop ticks
// (flaky under parallel test-file load).
async function waitForPersistedDescription(
  dbName: string,
  modelName: string,
  path: string,
  expected: string,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    const probe = createDocumentationService(modelName, { dbName });
    await waitForHydration(probe);
    const satisfied = probe.getDescription(path) === expected;
    probe.dispose();
    if (satisfied) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitForPersistedDescription timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitForPersistedTestCaseCell(
  dbName: string,
  modelName: string,
  subjectId: string,
  testCaseId: string,
  path: string,
  kind: 'input' | 'assertion',
  expected: string,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    const probe = createTestCasesService(modelName, subjectId, { dbName });
    await waitForHydration(probe);
    const satisfied = probe.getCell(testCaseId, path, kind) === expected;
    probe.dispose();
    if (satisfied) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitForPersistedTestCaseCell timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const ROWS: TestRow[] = [
  { path: 'age', section: 'inputs', order: 0, type: 'number', present: true },
  { path: 'income', section: 'inputs', order: 1, type: 'number', present: true },
  { path: 'eligible', section: 'assertions', order: 0, type: 'boolean', present: true },
];

describe('DocumentationService alongside test-cases-service', () => {
  it('descriptions written for the same paths a test-cases-service tracks persist independently', async () => {
    const modelName = `loan-eligibility-${Math.random().toString(36).slice(2)}`;
    const docsDbName = `docs-${modelName}`;
    const testCasesDbName = `test-cases-${modelName}`;

    const testCases = createTestCasesService(modelName, '*', { dbName: testCasesDbName });
    await waitForHydration(testCases);
    testCases.syncRows(ROWS);
    const standardCase = testCases.addTestCase('Standard applicant');
    testCases.setCell(standardCase.id, 'age', 'input', '30');
    testCases.setCell(standardCase.id, 'income', 'input', '55000');
    testCases.setCell(standardCase.id, 'eligible', 'assertion', 'true');

    const docs = createDocumentationService(modelName, { dbName: docsDbName });
    await waitForHydration(docs);

    // Write a few descriptions for the same paths the test cases exercise.
    docs.setDescription('age', 'Applicant age in years.');
    docs.setDescription('income', 'Annual gross income, in USD.');
    docs.setDescription('eligible', 'True when the applicant qualifies for the loan.');

    expect(docs.getDescription('age')).toBe('Applicant age in years.');
    expect(docs.getDescription('income')).toBe('Annual gross income, in USD.');
    expect(docs.getDescription('eligible')).toBe('True when the applicant qualifies for the loan.');

    // Wait for the background IndexedDB writes to actually land before tearing down.
    await waitForPersistedDescription(docsDbName, modelName, 'age', 'Applicant age in years.');
    await waitForPersistedDescription(docsDbName, modelName, 'income', 'Annual gross income, in USD.');
    await waitForPersistedDescription(docsDbName, modelName, 'eligible', 'True when the applicant qualifies for the loan.');
    await waitForPersistedTestCaseCell(testCasesDbName, modelName, '*', standardCase.id, 'eligible', 'assertion', 'true');
    docs.dispose();
    testCases.dispose();

    // Fresh instances, same dbNames — hydration must reflect what was persisted above, for both
    // overlays independently.
    const rehydratedDocs = createDocumentationService(modelName, { dbName: docsDbName });
    await waitForHydration(rehydratedDocs);
    expect(rehydratedDocs.getDescription('age')).toBe('Applicant age in years.');
    expect(rehydratedDocs.getDescription('income')).toBe('Annual gross income, in USD.');
    expect(rehydratedDocs.getDescription('eligible')).toBe('True when the applicant qualifies for the loan.');
    rehydratedDocs.dispose();

    const rehydratedTestCases = createTestCasesService(modelName, '*', { dbName: testCasesDbName });
    await waitForHydration(rehydratedTestCases);
    expect(rehydratedTestCases.listTestCases()).toEqual([
      {
        ...standardCase,
        inputs: { age: '30', income: '55000' },
        assertions: { eligible: 'true' },
      },
    ]);
    rehydratedTestCases.dispose();
  });
});
