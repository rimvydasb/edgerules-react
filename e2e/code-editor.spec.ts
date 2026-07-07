import { test, expect } from '@playwright/test';

test('Default story renders CodeMirror and allows typing', async ({ page }) => {
  await page.goto('/iframe.html?id=code-editor-codeeditor--default&viewMode=story');

  const editor = page.locator('.cm-content').first();
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.type('\nscore: 42');
  await expect(editor).toContainText('score: 42');
});

test('WithSyntaxError story shows lint error ranges', async ({ page }) => {
  await page.goto('/iframe.html?id=code-editor-codeeditor--with-syntax-error&viewMode=story');
  await expect(page.locator('.cm-lintRange-error, .cm-lintPoint-error').first()).toBeVisible();
});
