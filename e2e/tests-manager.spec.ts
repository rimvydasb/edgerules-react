import { test, expect, type Page } from '@playwright/test';

const STORY =
  '/iframe.html?id=tests-manager-testsmanager--indexed-array-paths&viewMode=story';

async function openPathEditor(page: Page, path: string) {
  const grid = page.getByTestId('tests-grid');
  await expect(grid).toBeVisible();
  await page.getByLabel(`path ${path}`).click();
  const editor = page.getByTestId(`path-editor-${path}`).locator('.cm-content');
  await expect(editor).toBeVisible();
  return editor;
}

test('array fields pre-generate their zero-indexed element rows, at every depth', async ({
  page,
}) => {
  await page.goto(STORY);

  await expect(page.getByTestId('row-application.applicant')).toBeVisible();
  await expect(
    page.getByTestId('row-application.applicant[0].name'),
  ).toBeVisible();
  await expect(
    page.getByTestId('row-application.applicant[0].creditLine[0].balance'),
  ).toBeVisible();
});

test('a valid path is not marked as an unknown reference when its cell is edited', async ({
  page,
}) => {
  await page.goto(STORY);
  await openPathEditor(page, 'application.applicant[0].creditLine[0].balance');

  // Give the linter a cycle; the path must stay clean — the whole-model language service used to
  // flag the first segment here.
  await page.waitForTimeout(300);
  await expect(page.locator('.cm-lintRange-error, .cm-lintPoint-error')).toHaveCount(0);
});

test('the completion popup lists addressable paths and is not covered by the grid', async ({
  page,
}) => {
  await page.goto(STORY);
  const editor = await openPathEditor(page, 'application.applicant[0].name');

  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('application.');

  const popup = page.locator('.cm-tooltip-autocomplete');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('application.applicant');
  // Paths only — no built-in functions from the model language.
  await expect(popup).not.toContainText('(');

  // The bug: the popup opens downward over the rows below, and those rows — sticky cells later in
  // DOM order at the same stacking level — painted on top of it, cutting it off one row down.
  // Hit-test down the popup's whole height: every point must land on the popup itself.
  const coveredAt = await popup.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const blocked: string[] = [];
    for (const fraction of [0.1, 0.35, 0.6, 0.9]) {
      const topmost = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height * fraction,
      );
      if (topmost === null || !element.contains(topmost)) {
        blocked.push(`${fraction}: ${topmost?.className ?? 'null'}`);
      }
    }
    return blocked;
  });
  expect(coveredAt).toEqual([]);
});

test('an unknown path is marked on the offending segment only, and can still be committed', async ({
  page,
}) => {
  await page.goto(STORY);
  const editor = await openPathEditor(page, 'application.applicant[0].name');

  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('application.applicant[0].nope');

  const marked = page.locator('.cm-lintRange-error');
  await expect(marked).toHaveText('nope');

  await page.keyboard.press('Escape');
  await expect(
    page.getByTestId('row-application.applicant[0].name'),
  ).toBeVisible();
});

test('duplicating an indexed row adds the next element below it', async ({ page }) => {
  await page.goto(STORY);
  await expect(page.getByTestId('tests-grid')).toBeVisible();

  await page.getByLabel('row menu application.applicant[0].name').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();

  await expect(
    page.getByTestId('row-application.applicant[1].name'),
  ).toBeVisible();
});
