import { test, expect } from '@playwright/test';

test('editable boxed expression mounts one cell editor and commits', async ({ page }) => {
  await page.goto('/iframe.html?id=boxed-editor-boxededitor--editable&viewMode=story');
  await page.getByRole('button', { name: 'Expand application' }).click();
  const calculationRow = page.getByRole('row', { name: 'application.calculation' });
  await calculationRow.getByRole('cell').nth(2).click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveCount(1);
  await editor.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.type('1 + 2');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('boxed-change-count')).toContainText('Changes: 1');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('editable cells retain language-service completions from their portable embed context', async ({ page }) => {
  await page.goto('/iframe.html?id=boxed-editor-boxededitor--editable&viewMode=story');
  await page.getByRole('button', { name: 'Expand application' }).click();
  await page.getByRole('row', { name: 'application.calculation' }).getByRole('cell').nth(2).click();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('amount');
});

test('read-only boxed story exposes no expression editor activation', async ({ page }) => {
  await page.goto('/iframe.html?id=boxed-editor-boxededitor--root-read-only&viewMode=story');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add field to *' })).toHaveCount(0);
});

test('loan-origination overview renders the authored root model without live editors', async ({ page }) => {
  await page.goto('/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview&viewMode=story');
  await expect(page.getByRole('treegrid')).toContainText('Applicant');
  await expect(page.getByRole('row', { name: 'application' })).toBeVisible();
  await expect(page.getByText('func creditScore(age: number, income: number) → number')).toBeVisible();
  await expect(page.getByRole('row', { name: 'finalDecision' })).toContainText('APPROVE');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('visual error and read-only scenarios retain their distinct UI states', async ({ page }) => {
  await page.goto('/iframe.html?id=boxed-editor-boxededitor--error-state&viewMode=story');
  await expect(page.getByRole('alert')).toContainText("unresolved reference 'a'");

  await page.goto('/iframe.html?id=boxed-editor-boxededitor--read-only-visual&viewMode=story');
  await expect(page.getByRole('treegrid')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add field to *' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit signature creditScore' })).toHaveCount(0);
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('visual nested-function and large-model scenarios keep rendering static', async ({ page }) => {
  await page.goto('/iframe.html?id=boxed-editor-boxededitor--nested-function-visual&viewMode=story');
  await page.getByRole('button', { name: 'Expand application' }).click();
  await expect(page.getByText('func affordability(income: number)')).toBeVisible();
  await page.getByRole('button', { name: 'Expand application.affordability' }).click();
  await expect(page.getByRole('row', { name: 'application.affordability.threshold' })).toContainText('monthlyIncome * 0.35');
  await expect(page.locator('.cm-editor')).toHaveCount(0);

  await page.goto('/iframe.html?id=boxed-editor-boxededitor--large-model-visual&viewMode=story');
  await expect(page.getByRole('row', { name: 'value0' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'value199' })).toBeVisible();
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('Project Explorer root paths and specialized boxed links route to their host editors', async ({ page }) => {
  await page.goto('/iframe.html?id=boxed-editor-boxededitor--project-explorer-integration&viewMode=story');
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText('boxed: *');

  await page.getByText('monthly()', { exact: true }).click();
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText('boxed: monthly');

  await page.getByText('Variables', { exact: true }).click();
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText('boxed: *');
  await page.getByRole('button', { name: 'Open Types Editor' }).click();
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText('type-definition: Applicant');

  await page.getByText('Variables', { exact: true }).click();
  await page.getByRole('button', { name: 'Open Decision Table Editor' }).click();
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText('ruleset: risk');
  await expect(page.locator('table.MuiTable-root')).toBeVisible();

  await page.getByText('Variables', { exact: true }).click();
  await page.getByRole('button', { name: 'Open Loop Editor' }).click();
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText('loop: counter');
  await expect(page.getByRole('alert')).toContainText('Loop Editor route: counter');
});
