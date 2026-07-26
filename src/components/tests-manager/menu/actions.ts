import type { TestCase, TestCasesService, TestRow } from '../../test-cases-service';
import { formatValue } from '../model/values';
import type { TestRunner } from '../tests-manager-types';

export interface TestsMenuAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

function copyActualToExpected(row: TestRow, testCasesService: TestCasesService): void {
  for (const testCase of testCasesService.listTestCases()) {
    const value = testCasesService.getResultSet(testCase.id)?.results[row.path]?.value;
    if (value !== undefined) {
      testCasesService.setCell(testCase.id, row.path, 'assertion', formatValue(value));
    }
  }
}

// The test-case column menu (the `:` in a column header). `onRename` starts the column header's
// own inline name editor — the menu action and the double-click shortcut both land on one commit
// path (`TestCasesService.renameTestCase`), consistent with "Rename: inline-edits the case name."
export function testCaseActionsFor(
  testCase: TestCase,
  testCasesService: TestCasesService,
  runner: TestRunner,
  onRename: () => void,
): TestsMenuAction[] {
  const all = testCasesService.listTestCases();
  const index = all.findIndex((c) => c.id === testCase.id);

  return [
    { label: 'Run', onSelect: () => void runner.run(testCase.id) },
    { label: 'Run all', onSelect: () => void runner.runAll() },
    { label: 'Rename', onSelect: onRename },
    {
      label: 'Duplicate',
      onSelect: () => {
        const copy = testCasesService.addTestCase(`${testCase.name} copy`);
        for (const [path, text] of Object.entries(testCase.inputs)) {
          testCasesService.setCell(copy.id, path, 'input', text);
        }
        for (const [path, text] of Object.entries(testCase.assertions)) {
          testCasesService.setCell(copy.id, path, 'assertion', text);
        }
        testCasesService.moveTestCase(copy.id, index + 1);
      },
    },
    {
      label: 'Insert left',
      onSelect: () => testCasesService.moveTestCase(testCasesService.addTestCase().id, index),
    },
    {
      label: 'Insert right',
      onSelect: () => testCasesService.moveTestCase(testCasesService.addTestCase().id, index + 1),
    },
    { label: 'Move left', onSelect: () => testCasesService.moveTestCase(testCase.id, index - 1), disabled: index <= 0 },
    {
      label: 'Move right',
      onSelect: () => testCasesService.moveTestCase(testCase.id, index + 1),
      disabled: index >= all.length - 1,
    },
    { label: 'Clear results', onSelect: () => testCasesService.clearResultSet(testCase.id) },
    { label: 'Delete', onSelect: () => testCasesService.removeTestCase(testCase.id), disabled: all.length <= 1 },
  ];
}

// The row menu (three-dots revealed on hover in the Path cell).
export function rowActionsFor(row: TestRow, testCasesService: TestCasesService): TestsMenuAction[] {
  const actions: TestsMenuAction[] = [];

  if (row.section === 'validations') {
    actions.push({
      label: 'Move to Assertions',
      onSelect: () => {
        testCasesService.setRowSection(row.path, 'assertions');
        copyActualToExpected(row, testCasesService);
      },
    });
  }

  if (row.section === 'assertions') {
    actions.push({ label: 'Move to Validations', onSelect: () => testCasesService.setRowSection(row.path, 'validations') });
  }

  if (row.section === 'assertions') {
    actions.push({ label: 'Copy actual to expected', onSelect: () => copyActualToExpected(row, testCasesService) });
  }

  return actions;
}
