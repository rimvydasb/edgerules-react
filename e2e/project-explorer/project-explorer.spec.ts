import { test, expect } from '@playwright/test';
import { openStory } from '../support/storybook';

// Smoke-level only: RTL (ProjectExplorer.test.tsx) already covers behavior in detail against the
// real engine. This just confirms the built artifact (post-tsup, post-Storybook-build) actually
// renders in a real browser, driving the same fixture-backed stories as the single source of
// truth — no live-engine story exists here since the real engine can't yet produce a `[dt]` node
// (see the plan's known engine gap).

test('Default story renders the example model tree', async ({ page }) => {
  await openStory(page, 'project-explorer-projectexplorer--default');
  await expect(page.getByText('Types', { exact: true })).toBeVisible();
  await expect(page.getByText('Variables', { exact: true })).toBeVisible();
  await expect(page.getByText('nested', { exact: true })).toBeVisible();
});

test('Expanded story reveals group children after clicking Types/Variables', async ({ page }) => {
  await openStory(page, 'project-explorer-projectexplorer--expanded');
  await expect(page.getByText('Person', { exact: true })).toBeVisible();
  await expect(page.getByText('PeopleList', { exact: true })).toBeVisible();
  await expect(page.getByText('globalConst', { exact: true })).toBeVisible();
  await expect(page.getByText('list', { exact: true })).toBeVisible();
});

test('WithLinkingError story shows an error badge after expanding the broken context', async ({ page }) => {
  await openStory(page, 'project-explorer-projectexplorer--with-linking-error');
  await expect(page.getByTestId('icon-ctx')).toBeVisible();
});
