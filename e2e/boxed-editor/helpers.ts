import { expect, type Page } from '@playwright/test';
import { openStory } from '../support/storybook';

export const STORY_PREFIX = 'boxed-editor-boxededitor--';

/** Opens a Boxed Editor story by its short name (e.g. `'editable-expression'`) and asserts the
 * treegrid actually rendered, rather than a fallback error state — every test in this component's
 * suite starts from this, so a broken story fails fast with a clear message instead of a confusing
 * downstream locator timeout. */
export async function openBoxedEditorStory(page: Page, storyName: string): Promise<void> {
  const storyId = `${STORY_PREFIX}${storyName}`;
  await openStory(page, storyId);
  await expect(page.getByRole('treegrid'), `Story "${storyId}" should render a Boxed Editor treegrid`).toBeVisible();
  await expect(page.getByText('The component failed to render properly')).not.toBeVisible();
}

export function valueCell(page: Page, path: string) {
  return page.getByTestId(`row-${path}`).locator('[data-column="value"]');
}

export async function replaceActiveExpression(page: Page, value: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveCount(1);
  await editor.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+A`);
  if (value === '') {
    await page.keyboard.press('Backspace');
  } else {
    await page.keyboard.insertText(value);
  }
}

export async function commitExpression(page: Page, path: string, value: string): Promise<void> {
  await valueCell(page, path).click();
  await replaceActiveExpression(page, value);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
}

export async function renameRow(page: Page, path: string, newName: string): Promise<string> {
  const row = page.getByTestId(`row-${path}`);
  const currentName = path.split('.').at(-1) ?? path;
  await row.getByText(currentName, { exact: true }).click();
  const input = page.getByLabel(`name ${path}`);
  await input.fill(newName);
  await input.press('Enter');

  const separator = path.lastIndexOf('.');
  const renamedPath = separator < 0 ? newName : `${path.slice(0, separator)}.${newName}`;
  await expect(page.getByTestId(`row-${renamedPath}`)).toHaveCount(1);
  return renamedPath;
}

export async function appendListItem(page: Page, listPath: string, index: number, value: string): Promise<void> {
  await page.getByTestId(`append-${listPath}`).click();
  const itemPath = `${listPath}[${index}]`;
  await expect(page.getByTestId(`row-${itemPath}`)).toHaveCount(1);
  await commitExpression(page, itemPath, value);
}

export async function addList(page: Page, name: string): Promise<string> {
  await page.getByTestId('row-*').getByRole('button', { name: 'Open row actions' }).click();
  await page.getByRole('menuitem', { name: 'Add list' }).click();
  return renameRow(page, 'list', name);
}

/** Opens the three-dot menu of the row at `path` (defaults to the model root, `'*'`) and clicks
 * the named menu item — the shared entry point every `Add …`/`Delete …`/`Duplicate` action in the
 * new CRUD-matrix specs (functions, decision tables, relations, business-flow) should use instead
 * of hand-rolling the button lookup per call site. */
export async function chooseRowAction(page: Page, path: string, label: string): Promise<void> {
  await page.getByTestId(`row-${path}`).getByRole('button', { name: 'Open row actions' }).click();
  await page.getByRole('menuitem', { name: label }).click();
}
