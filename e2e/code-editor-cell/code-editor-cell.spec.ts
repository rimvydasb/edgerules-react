import { test, expect } from '@playwright/test';
import { openStory } from '../support/storybook';

test('Default cell story renders a single-line editor and commits on Enter', async ({ page }) => {
  await openStory(page, 'code-editor-codeeditorcell--default');

  const editor = page.locator('.cm-content').first();
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('applicant.age + 1');

  await editor.click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('committed')).toContainText('applicant.age + 1');
});

test('Cell completions include names from the surrounding model (embed context)', async ({
  page,
}) => {
  await openStory(page, 'code-editor-codeeditorcell--default');

  const editor = page.locator('.cm-content').first();
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' + applicant.');

  const tooltip = page.locator('.cm-tooltip-autocomplete');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('age');
  await expect(tooltip).toContainText('address');
});

test('Cell lints against the surrounding model', async ({ page }) => {
  await openStory(page, 'code-editor-codeeditorcell--with-lint-error');
  await expect(page.locator('.cm-lintRange-error, .cm-lintPoint-error').first()).toBeVisible();
});

test('Multiline cell keeps Enter as newline and commits with Ctrl+Enter', async ({ page }) => {
  await openStory(page, 'code-editor-codeeditorcell--multiline');

  const editor = page.locator('.cm-content').first();
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type('\n// note');
  await expect(page.getByTestId('committed')).toContainText('—');

  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+Enter`);
  await expect(page.getByTestId('committed')).toContainText('// note');
});
