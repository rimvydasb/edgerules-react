import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import type { ReactElement } from 'react';
import type { TestCase, TestCasesService, TestRow } from '../../test-cases-service';
import { hasIndex, nextDuplicatePath } from '../model/paths';
import { formatValue } from '../model/values';
import type { TestRunner } from '../tests-manager-types';

export interface TestsMenuAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  icon?: ReactElement;
}

function copyActualToExpected(row: TestRow, testCasesService: TestCasesService): void {
  for (const testCase of testCasesService.listTestCases()) {
    const value = testCasesService.getResultSet(testCase.id)?.results[row.path]?.value;
    if (value !== undefined) {
      testCasesService.setCell(testCase.id, row.path, 'assertion', formatValue(value));
    }
  }
}

// The test-case column menu (the `:` in a column header). Renaming and reordering aren't here —
// the header's name is click-to-edit and columns reorder via the header's own drag handle.
export function testCaseActionsFor(
  testCase: TestCase,
  testCasesService: TestCasesService,
  runner: TestRunner,
): TestsMenuAction[] {
  const all = testCasesService.listTestCases();
  const index = all.findIndex((c) => c.id === testCase.id);

  return [
    { label: 'Run', onSelect: () => void runner.run(testCase.id) },
    { label: 'Run all', onSelect: () => void runner.runAll() },
    {
      label: 'Clone',
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
    { label: 'Clear results', onSelect: () => testCasesService.clearResultSet(testCase.id) },
    { label: 'Delete', onSelect: () => testCasesService.removeTestCase(testCase.id), disabled: all.length <= 1 },
  ];
}

// The row menu (three-dots revealed on hover in the Path cell).
export function rowActionsFor(row: TestRow, testCasesService: TestCasesService): TestsMenuAction[] {
  const actions: TestsMenuAction[] = [];

  // Only an indexed path can be duplicated: a duplicate is one more element of a list the model
  // already declares (`applicant[0].name` -> `applicant[1].name`), never a new field. That is also
  // why there is no "add row" — the grid's population comes from the model, not from the user.
  if (hasIndex(row.path)) {
    const target = nextDuplicatePath(
      row.path,
      testCasesService.listRows().map((other) => other.path),
    );
    actions.push({
      label: 'Duplicate',
      icon: <ContentCopyIcon fontSize="small" />,
      disabled: target === undefined,
      onSelect: () => {
        if (target) testCasesService.duplicateRow(row.path, target);
      },
    });
  }

  if (row.section === 'validations') {
    actions.push({
      label: 'Move to Assertions',
      onSelect: () => {
        testCasesService.setRowSection(row.path, 'assertions');
        copyActualToExpected(row, testCasesService);
      },
    });
  }

  // Demoting an `Assertions` row back to `Validations` is what `Delete` means for a derived row —
  // the path itself belongs to the model and cannot be deleted. A user-authored row has no such
  // anchor, so for it `Delete row` means exactly that (below).
  if (row.section === 'assertions' && !row.custom) {
    actions.push({
      label: 'Delete',
      icon: <DeleteIcon fontSize="small" />,
      onSelect: () => testCasesService.setRowSection(row.path, 'validations'),
    });
  }

  if (row.section === 'assertions') {
    actions.push({ label: 'Copy actual to expected', onSelect: () => copyActualToExpected(row, testCasesService) });
  }

  if (row.custom) {
    actions.push({
      label: 'Delete row',
      icon: <DeleteIcon fontSize="small" />,
      onSelect: () => testCasesService.removeRow(row.path),
    });
  }

  return actions;
}
