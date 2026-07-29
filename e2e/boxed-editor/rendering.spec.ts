import { expect, test } from '@playwright/test';
import { openStory, storyIdsWithPrefix } from '../support/storybook';
import {
  chooseRowAction,
  commitExpression,
  expectLiveModel,
  expectLiveResult,
  openBoxedEditorStory,
  STORY_PREFIX,
} from './helpers';

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

  test('executes the model and shows a live result', async ({ page }) => {
    await openBoxedEditorStory(page, 'blank-model');
    await expectLiveResult(page, '{}');

    await chooseRowAction(page, '*', 'Add field');
    await commitExpression(page, 'field', '42');

    await expectLiveResult(page, '{"field":42}');
    await expectLiveModel(page, /"field"/);
  });

  test('shows an execution failure instead of a stale result', async ({ page }) => {
    await openBoxedEditorStory(page, 'function-crud-playground');
    await expectLiveResult(page, /"result":100/);

    await chooseRowAction(page, 'principal', 'Delete');

    await expectLiveResult(page, /^error: .*principal/i);
  });

  test('solves an optimisation end to end', async ({ page }) => {
    await openBoxedEditorStory(page, 'optimisation-crud');
    await expectLiveResult(page, /"plan":\{.*"status":"optimal".*\}/i);
  });
});
