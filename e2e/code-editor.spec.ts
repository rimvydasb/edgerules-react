import { test, expect } from '@playwright/test';

test('Default story renders CodeMirror and allows typing', async ({ page }) => {
  await page.goto('/iframe.html?id=code-editor-codeeditor--default&viewMode=story');

  const editor = page.locator('.cm-content').first();
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type('\nscore: 42');
  await expect(editor).toContainText('score: 42');
});

test('Default story applies EdgeRules syntax highlighting', async ({ page }) => {
  await page.goto('/iframe.html?id=code-editor-codeeditor--default&viewMode=story');

  await expect(page.locator('.tok-keyword').first()).toBeVisible(); // func / type
  await expect(page.locator('.tok-string').first()).toBeVisible(); // "Vilnius"
  await expect(page.locator('.tok-number').first()).toBeVisible(); // 21
  await expect(page.locator('.tok-typeName').first()).toBeVisible(); // Customer
});

test('WithSyntaxError story shows lint error ranges', async ({ page }) => {
  await page.goto('/iframe.html?id=code-editor-codeeditor--with-syntax-error&viewMode=story');
  await expect(page.locator('.cm-lintRange-error, .cm-lintPoint-error').first()).toBeVisible();
});

test('Ctrl+Space opens engine completions', async ({ page }) => {
  await page.goto('/iframe.html?id=code-editor-codeeditor--default&viewMode=story');

  const editor = page.locator('.cm-content').first();
  await editor.click();
  // Place the cursor right after `limit: ` on its line, then request completions.
  const limitLine = page.locator('.cm-line', { hasText: 'limit:' }).first();
  await limitLine.click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 'limit: '.length; i += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('Control+Space');

  const tooltip = page.locator('.cm-tooltip-autocomplete');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('applicant');
  await expect(tooltip).toContainText('riskScore');
});

test('Ctrl+Click navigates to the definition', async ({ page }) => {
  await page.goto('/iframe.html?id=code-editor-codeeditor--default&viewMode=story');

  const usage = page.locator('.cm-line', { hasText: 'riskScore(applicant.age)' }).first();
  await expect(usage).toBeVisible();
  // Focus the editor first so CodeMirror mirrors its selection into the DOM selection.
  await usage.click();
  // Ctrl+Click (Meta on macOS) the `riskScore` call to jump to `func riskScore(...)`.
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const target = usage.locator('.tok-function', { hasText: 'riskScore' }).first();
  await target.click({ modifiers: [modifier] });

  // The definition's name becomes the selection.
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe('riskScore');
});

test('Shift+Alt+F formats the document', async ({ page }) => {
  await page.goto('/iframe.html?id=code-editor-codeeditor--default&viewMode=story');

  const editor = page.locator('.cm-content').first();
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type('\n   badlyIndented:1');
  await page.keyboard.press('Shift+Alt+f');

  await expect(editor).toContainText('badlyIndented: 1');
  await expect(editor).not.toContainText('badlyIndented:1');
});
