import { test, expect, type Page } from '@playwright/test';
import { openStory } from '../support/storybook';

const PREFIX = 'flow-editor-outputnode--';

async function open(page: Page, story: string) {
  await openStory(page, `${PREFIX}${story}`);
  // xyflow hides a node until it is measured.
  await expect(page.getByTestId('output-node-output')).toBeVisible({ timeout: 15_000 });
}

test('shows a dash while nothing is wired', async ({ page }) => {
  await open(page, 'unwired');
  await expect(page.getByTestId('output-value')).toHaveText('—');
});

test('shows the engine value of the wired result', async ({ page }) => {
  await open(page, 'wired');
  await expect(page.getByTestId('output-value')).toHaveText("'high'");
  await expect(page.getByTestId('output-node-output')).toContainText('decision.level');
});

test('shows the value of an unnamed result', async ({ page }) => {
  await open(page, 'unnamed-result');
  await expect(page.getByTestId('output-value')).toContainText('2933.33');
  await expect(page.getByTestId('output-node-output')).toContainText('Monthly payment');
});

test('shows the error row when the wired path does not exist', async ({ page }) => {
  await open(page, 'missing-path');
  await expect(page.getByRole('alert')).toContainText('no decision.missing');
});
