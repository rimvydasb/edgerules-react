import type { TestCase, TestCasesService, TestRow } from '../../test-cases-service';
import { formatValue } from '../model/values';
import type { TestRunner } from '../tests-manager-types';

export interface TestsMenuAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

function copyActualToExpected(row: TestRow, testCases: TestCasesService): void {
  for (const testCase of testCases.listTestCases()) {
    const value = testCases.getResultSet(testCase.id)?.results[row.path]?.value;
    if (value !== undefined) {
      testCases.setCell(testCase.id, row.path, 'assertion', formatValue(value));
    }
  }
}

// The test-case column menu (the `:` in a column header). `onRename` starts the column header's
// own inline name editor — the menu action and the double-click shortcut both land on one commit
// path (`TestCasesService.renameTestCase`), consistent with "Rename: inline-edits the case name."
export function testCaseActionsFor(
  testCase: TestCase,
  testCases: TestCasesService,
  runner: TestRunner,
  onRename: () => void,
): TestsMenuAction[] {
  const all = testCases.listTestCases();
  const index = all.findIndex((c) => c.id === testCase.id);

  return [
    { label: 'Run', onSelect: () => void runner.run(testCase.id) },
    { label: 'Run all', onSelect: () => void runner.runAll() },
    { label: 'Rename', onSelect: onRename },
    {
      label: 'Duplicate',
      onSelect: () => {
        const copy = testCases.addTestCase(`${testCase.name} copy`);
        for (const [path, text] of Object.entries(testCase.inputs)) {
          testCases.setCell(copy.id, path, 'input', text);
        }
        for (const [path, text] of Object.entries(testCase.assertions)) {
          testCases.setCell(copy.id, path, 'assertion', text);
        }
        testCases.moveTestCase(copy.id, index + 1);
      },
    },
    {
      label: 'Insert left',
      onSelect: () => testCases.moveTestCase(testCases.addTestCase().id, index),
    },
    {
      label: 'Insert right',
      onSelect: () => testCases.moveTestCase(testCases.addTestCase().id, index + 1),
    },
    { label: 'Move left', onSelect: () => testCases.moveTestCase(testCase.id, index - 1), disabled: index <= 0 },
    {
      label: 'Move right',
      onSelect: () => testCases.moveTestCase(testCase.id, index + 1),
      disabled: index >= all.length - 1,
    },
    { label: 'Clear results', onSelect: () => testCases.clearResultSet(testCase.id) },
    { label: 'Delete', onSelect: () => testCases.removeTestCase(testCase.id), disabled: all.length <= 1 },
  ];
}

// The row menu (three-dots revealed on hover in the Path cell).
export function rowActionsFor(row: TestRow, testCases: TestCasesService): TestsMenuAction[] {
  const actions: TestsMenuAction[] = [];

  if (row.section === 'validations') {
    actions.push({
      label: 'Move to Assertions',
      onSelect: () => {
        testCases.setRowSection(row.path, 'assertions');
        copyActualToExpected(row, testCases);
      },
    });
  }

  if (row.section === 'assertions') {
    actions.push({ label: 'Move to Validations', onSelect: () => testCases.setRowSection(row.path, 'validations') });
  }

  if (row.section === 'assertions') {
    actions.push({ label: 'Copy actual to expected', onSelect: () => copyActualToExpected(row, testCases) });
  }

  return actions;
}
