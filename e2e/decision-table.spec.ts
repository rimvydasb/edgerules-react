import { test, expect } from '@playwright/test';

test('DecisionTable story renders the grid with re-sugared cells and no CodeMirror mounted', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=decision-table-decisiontableeditor--decision-table&viewMode=story');

  const table = page.locator('table.MuiTable-root');
  await expect(table).toBeVisible();
  await expect(table).toContainText('18..25');
  await expect(table).toContainText('< 30000');
  // Boolean-expression row spans the input columns.
  await expect(page.locator('td[colspan="3"]')).toContainText('age >= 65');
  // Display cells are static — the editor mounts only on demand.
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(page.getByTestId('live-result')).toContainText('"level":"high"');
});

test('double-clicking a cell opens a CodeEditorCell; committing updates the live result', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=decision-table-decisiontableeditor--decision-table&viewMode=story');

  const limitCell = page.locator('[role="button"]', { hasText: '1000' }).first();
  await limitCell.dblclick();

  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.selectText();
  await page.keyboard.type('1500');
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('live-result')).toContainText('"limit":1500');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('a rejected edit surfaces the engine error and keeps the model intact', async ({ page }) => {
  await page.goto('/iframe.html?id=decision-table-decisiontableeditor--decision-table&viewMode=story');

  const ageCell = page.locator('[role="button"]', { hasText: '18..25' }).first();
  await ageCell.dblclick();
  const editor = page.locator('.cm-content');
  await editor.selectText();
  await page.keyboard.type('"not a number test"');
  await page.keyboard.press('Enter');

  await expect(page.locator('[role="alert"]')).toBeVisible();
  // Model still executes — the failed write was restored.
  await expect(page.getByTestId('live-result')).toContainText('"level":"high"');
});

test('Scorecard story shows the score column and sums edited scores', async ({ page }) => {
  await page.goto('/iframe.html?id=decision-table-decisiontableeditor--scorecard&viewMode=story');

  await expect(page.locator('table.MuiTable-root')).toContainText('score');
  await expect(page.locator('body')).toContainText('scorecard');
  await expect(page.getByTestId('live-result')).toContainText('total: 30');
});

test('hit policy select switches to best-match and shows the priority column', async ({ page }) => {
  await page.goto('/iframe.html?id=decision-table-decisiontableeditor--decision-table&viewMode=story');

  await page.getByLabel('Hit policy').click();
  await page.getByRole('option', { name: /best match/i }).click();

  await expect(page.locator('table.MuiTable-root')).toContainText('priority');
});
