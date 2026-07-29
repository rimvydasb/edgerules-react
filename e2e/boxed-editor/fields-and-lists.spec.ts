import { expect, test } from '@playwright/test';
import {
  addList,
  appendListItem,
  commitExpression,
  openBoxedEditorStory,
  renameRow,
  replaceActiveExpression,
  valueCell,
} from './helpers';

test.describe('Boxed Editor / fields and lists', () => {
  test('creates and completes fields through root, context, and complex-type placeholders', async ({ page }) => {
    await openBoxedEditorStory(page, 'editable-expression');

    await page.getByTestId('append-*').click();
    await page.getByTestId('append-*').click();
    await expect(page.getByTestId('row-field')).toHaveCount(1);
    await expect(page.getByTestId('row-field2')).toHaveCount(1);

    const affordabilityScore = await renameRow(page, 'field', 'affordabilityScore');
    const riskBand = await renameRow(page, 'field2', 'riskBand');
    await commitExpression(page, affordabilityScore, 'application.loanAmount / 10');
    await commitExpression(page, riskBand, '"medium"');

    await expect(page.getByTestId(`row-${affordabilityScore}`)).toHaveCount(1);
    await expect(valueCell(page, affordabilityScore)).toHaveText('application.loanAmount / 10');
    await expect(page.getByTestId(`row-${riskBand}`)).toHaveCount(1);
    await expect(valueCell(page, riskBand)).toHaveText("'medium'");

    await page.getByTestId('append-application').click();
    const termMonths = await renameRow(page, 'application.field', 'termMonths');
    await commitExpression(page, termMonths, '12');
    await expect(valueCell(page, termMonths)).toHaveText('12');

    await page.getByTestId('append-Applicant').click();
    const creditLimit = await renameRow(page, 'Applicant.field', 'creditLimit');
    await commitExpression(page, creditLimit, '<number, required: true>');
    await expect(valueCell(page, creditLimit)).toContainText('<number, required: true>');

    await commitExpression(page, 'payment', 'application.loanAmount / 6');
    await expect(valueCell(page, affordabilityScore)).toHaveText('application.loanAmount / 10');
    await expect(valueCell(page, riskBand)).toHaveText("'medium'");
    await expect(valueCell(page, termMonths)).toHaveText('12');
    await expect(valueCell(page, creditLimit)).toContainText('<number, required: true>');
    await expect(page.getByTestId('boxed-change-count')).toHaveText('Changes: 13');
  });

  test('reports invalid values, keeps other rows interactive, recovers, and cancels drafts', async ({ page }) => {
    await openBoxedEditorStory(page, 'editable-expression');
    const payment = valueCell(page, 'payment');

    await payment.click();
    await replaceActiveExpression(page, 'application.loanAmount /');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Expected a value after "/".');

    await page.getByTestId('row-application.propertyValue').getByText('propertyValue', { exact: true }).click();
    await expect(page.getByLabel('name application.propertyValue')).toBeVisible();
    await page.getByLabel('name application.propertyValue').press('Escape');

    await commitExpression(page, 'payment', 'application.loanAmount / 6');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(payment).toHaveText('application.loanAmount / 6');
    await expect(page.getByTestId('live-payment')).toContainText('application.loanAmount / 6');

    await payment.click();
    await replaceActiveExpression(page, '999');
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-editor')).toHaveCount(0);
    await expect(payment).toHaveText('application.loanAmount / 6');
    await expect(page.getByTestId('live-payment')).toContainText('application.loanAmount / 6');

    await payment.click();
    await replaceActiveExpression(page, '');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('A value is required.');
    await expect(page.locator('.cm-editor')).toHaveCount(1);
    await expect(page.getByTestId('live-payment')).toContainText('application.loanAmount / 6');
    await expect(page.getByRole('treegrid')).toBeVisible();
  });

  test('creates a list and preserves numeric and string boundary values through recovery', async ({ page }) => {
    await openBoxedEditorStory(page, 'editable-expression');

    const numberListPath = await addList(page, 'boundaryNumbers');
    await appendListItem(page, numberListPath, 0, '0');
    await appendListItem(page, numberListPath, 1, '-1');
    await appendListItem(page, numberListPath, 2, '999999999999');

    const expectedNumbers = ['0', '-1', '999999999999'];
    for (const [index, expectedValue] of expectedNumbers.entries()) {
      await expect(valueCell(page, `${numberListPath}[${index}]`)).toHaveText(expectedValue);
    }

    await page.getByTestId(`append-${numberListPath}`).click();
    const invalidPath = `${numberListPath}[3]`;
    await valueCell(page, invalidPath).click();
    await replaceActiveExpression(page, '1 +');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Expected a value after "+".');

    for (const [index, expectedValue] of expectedNumbers.entries()) {
      await expect(valueCell(page, `${numberListPath}[${index}]`)).toHaveText(expectedValue);
    }

    await replaceActiveExpression(page, '42');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(valueCell(page, invalidPath)).toHaveText('42');

    const stringListPath = await addList(page, 'boundaryStrings');
    await appendListItem(page, stringListPath, 0, '""');
    await appendListItem(page, stringListPath, 1, '"quoted value"');
    await expect(valueCell(page, `${stringListPath}[0]`)).toHaveText("''");
    await expect(valueCell(page, `${stringListPath}[1]`)).toHaveText("'quoted value'");
  });

  test('read-only story does not expose mutation controls or expression editing', async ({ page }) => {
    await openBoxedEditorStory(page, 'read-only');
    await expect(page.locator('[data-testid^="append-"]')).toHaveCount(0);

    await valueCell(page, 'payment').click();
    await expect(page.locator('.cm-editor')).toHaveCount(0);
  });
});
