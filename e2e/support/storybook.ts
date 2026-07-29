import { expect, type Page } from '@playwright/test';

export interface StoryIndex {
  entries: Record<string, { type?: string }>;
}

/** The full Storybook story index for the running `storybook-static` build under test. */
export async function storyIndex(page: Page): Promise<StoryIndex> {
  const response = await page.request.get('/index.json');
  expect(response.ok(), 'Storybook should expose its story index').toBe(true);
  return (await response.json()) as StoryIndex;
}

/** Every current story id whose id starts with `prefix` (e.g. `'boxed-editor-boxededitor--'`),
 * sorted — the live source of truth for "one test per story" smoke coverage, so a renamed or
 * removed story is caught instead of silently going untested. */
export async function storyIdsWithPrefix(page: Page, prefix: string): Promise<string[]> {
  const index = await storyIndex(page);
  return Object.entries(index.entries)
    .filter(([id, entry]) => id.startsWith(prefix) && entry.type === 'story')
    .map(([id]) => id)
    .sort();
}

/** Navigates directly to one story's iframe — the shared entry point every component's e2e spec
 * uses instead of hand-building the `/iframe.html?id=…` URL itself. */
export async function openStory(page: Page, storyId: string): Promise<void> {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
}
