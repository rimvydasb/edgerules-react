import { expect, test, type Locator, type Page } from '@playwright/test';
import { openStory } from '../support/storybook';

// Visual regression for the three grids (docs/MANTINE_MIGRATION_STORY.md, "Grid Visual Rules").
// Baselines MUST come from one environment (same OS + browser build); each state is captured at
// device scale factor 1 and 2 — double borders and 1px offsets are only visible at 2.

const SCALES = [1, 2] as const;

interface Shot {
  name: string;
  story: string;
  /** The element to capture. */
  target: (page: Page) => Locator;
  /** Puts the story into the state under test. */
  prepare?: (page: Page) => Promise<void>;
}

const boxed = (page: Page) => page.getByRole('treegrid');
const decisionTable = (page: Page) => page.locator('table[aria-label$="decision table"]');
const testsGrid = (page: Page) => page.getByTestId('tests-grid');

const SHOTS: Shot[] = [
  // ---- Boxed editor
  { name: 'boxed-default', story: 'boxed-editor-boxededitor--editable-expression', target: boxed },
  {
    name: 'boxed-focused-cell',
    story: 'boxed-editor-boxededitor--editable-expression',
    target: boxed,
    prepare: async (page) => {
      await page.getByTestId('row-Applicant.name').getByText('name', { exact: true }).click();
      await expect(page.getByLabel('name Applicant.name')).toBeFocused();
    },
  },
  {
    name: 'boxed-error-popover',
    story: 'boxed-editor-boxededitor--editable-expression',
    target: (page) => page.locator('body'),
    prepare: async (page) => {
      await page.getByTestId('row-Applicant.name').getByText('name', { exact: true }).click();
      const input = page.getByLabel('name Applicant.name');
      await input.fill('1bad name');
      await input.press('Enter');
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  { name: 'boxed-nested-grid', story: 'boxed-editor-boxededitor--collections-list-and-relation', target: boxed },
  { name: 'boxed-new-item-row', story: 'boxed-editor-boxededitor--blank-model', target: boxed },
  // ---- Decision table
  { name: 'dt-default', story: 'decision-table-decisiontableeditor--decision-table', target: decisionTable },
  {
    name: 'dt-focused-cell',
    story: 'decision-table-decisiontableeditor--decision-table',
    target: decisionTable,
    prepare: async (page) => {
      await decisionTable(page).locator('[data-grid-row="0"][data-grid-col="0"]').focus();
    },
  },
  {
    name: 'dt-error',
    story: 'decision-table-decisiontableeditor--decision-table',
    target: decisionTable,
    prepare: async (page) => {
      const cell = decisionTable(page).locator('[data-grid-row="0"][data-grid-col="0"]');
      await cell.dblclick();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('((');
      await page.keyboard.press('Enter');
      // The rejected edit stays open with the engine's diagnostic under the cell.
      await expect(decisionTable(page).locator('.cm-editor')).toBeVisible();
    },
  },
  { name: 'dt-nested-scorecard', story: 'decision-table-decisiontableeditor--scorecard', target: decisionTable },
  // ---- Tests manager
  { name: 'tm-default', story: 'tests-manager-testsmanager--workbook', target: testsGrid },
  {
    name: 'tm-focused-cell',
    story: 'tests-manager-testsmanager--workbook',
    target: testsGrid,
    prepare: async (page) => {
      await page.getByLabel('input age').first().focus();
    },
  },
  {
    name: 'tm-error',
    story: 'tests-manager-testsmanager--workbook',
    target: testsGrid,
    prepare: async (page) => {
      const input = page.getByLabel('input age').first();
      await input.fill('not a number');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
    },
  },
  { name: 'tm-nested-paths', story: 'tests-manager-testsmanager--indexed-array-paths', target: testsGrid },
];

for (const scale of SCALES) {
  test.describe(`scale ${scale}`, () => {
    test.use({ deviceScaleFactor: scale, viewport: { width: 1400, height: 900 } });

    for (const shot of SHOTS) {
      test(shot.name, async ({ page }) => {
        await openStory(page, shot.story);
        await expect(shot.target(page).first()).toBeVisible();
        await shot.prepare?.(page);
        // A hover tooltip left under the pointer would make the capture unstable.
        await page.mouse.move(1399, 899);
        await expect(shot.target(page).first()).toHaveScreenshot(`${shot.name}@${scale}x.png`, {
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.002,
        });
      });
    }
  });
}
