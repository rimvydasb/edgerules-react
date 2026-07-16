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
