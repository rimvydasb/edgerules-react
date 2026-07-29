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

export async function expectLiveResult(page: Page, expected: string | RegExp): Promise<void> {
  await expect(page.getByTestId('live-result')).toHaveText(expected);
}

export async function expectLiveModel(page: Page, expected: string | RegExp): Promise<void> {
  await expect(page.getByTestId('live-model')).toHaveText(expected);
}

export async function expectRowError(page: Page, path: string, text: string | RegExp): Promise<void> {
  await expect(
    page.getByTestId(`row-error-${path}`),
    `Mutation error for "${path}" should be visible (Phase 2 error channel may not be implemented yet)`,
  ).toContainText(text);
}

export async function expectNoRowError(page: Page, path: string): Promise<void> {
  await expect(page.getByTestId(`row-error-${path}`)).toHaveCount(0);
}

/** Ordered argument/column labels, read from the stable Phase 4 header-cell test IDs. */
export async function columnHeaders(page: Page, rowPath: string): Promise<string[]> {
  const prefix = `column-${rowPath}-`;
  return valueCell(page, rowPath)
    .locator(`[data-testid^="${prefix}"]`)
    .evaluateAll(
      (elements, idPrefix) =>
        elements.map((element) => element.getAttribute('data-testid')?.slice(idPrefix.length) ?? ''),
      prefix,
    );
}

/** Performs an intentionally stepped pointer gesture because @dnd-kit ignores instantaneous moves. */
export async function dragRow(page: Page, fromPath: string, toPath: string): Promise<void> {
  const handle = page.getByTestId(`row-${fromPath}`).getByLabel('Drag to reorder row');
  const target = page.getByTestId(toPath.startsWith('append-') ? toPath : `row-${toPath}`);
  await handle.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error(`Cannot drag "${fromPath}" to "${toPath}": a row is not visible`);

  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(10);
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(start.x + ((end.x - start.x) * step) / 8, start.y + ((end.y - start.y) * step) / 8);
    await page.waitForTimeout(10);
  }
  await page.mouse.up();
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
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}
