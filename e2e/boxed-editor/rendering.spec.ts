import { expect, test } from '@playwright/test';
import { openStory, storyIdsWithPrefix } from '../support/storybook';
import { STORY_PREFIX } from './helpers';

test.describe('Boxed Editor / rendering', () => {
  test('every current Boxed Editor story renders from the Storybook index', async ({ page }) => {
    const storyIds = await storyIdsWithPrefix(page, STORY_PREFIX);
    expect(storyIds, 'Storybook should expose Boxed Editor stories').not.toHaveLength(0);

    for (const storyId of storyIds) {
      await test.step(storyId, async () => {
        await openStory(page, storyId);
        await expect(
          page.locator('[role="treegrid"], [role="alert"]').first(),
          `Story "${storyId}" should render editor content`,
        ).toBeVisible();
        await expect(page.getByText('The component failed to render properly')).not.toBeVisible();

        if (storyId !== `${STORY_PREFIX}fatal-error`) {
          await expect(
            page.getByRole('treegrid'),
            `Story "${storyId}" unexpectedly rendered a fatal editor state`,
          ).toBeVisible();
        }
      });
    }
  });
});
