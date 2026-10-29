import {expect, test} from '@playwright/test';
import {openBoxedEditorStory} from './helpers';

// The one-step header row on top of every opened Boxed Expression: the title, the column toggles and the `plus` menu of
// the model root. The model settings belong to the Shell (`e2e/models/model-settings.spec.ts`).

test.describe('Boxed Editor / header row', () => {
    test('the model root shows its name and a plus menu that only adds', async ({page}) => {
        await openBoxedEditorStory(page, 'test-cases-and-test-runner');
        const header = page.getByTestId('row-*');
        await expect(header.getByRole('heading')).toHaveText('Model');

        await header.getByRole('button', {name: 'Open row actions'}).click();
        await expect(page.getByRole('menuitem', {name: 'Add field'})).toBeVisible();
        await expect(page.getByRole('menuitem', {name: 'Model settings'})).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(header.getByRole('button', {name: 'Model settings'})).toHaveCount(0);
    });

    test('an opened entity shows its metaphor name without the plus menu', async ({page}) => {
        await openBoxedEditorStory(page, 'focused-context');
        const header = page.getByTestId('header-row');
        await expect(header.getByRole('heading')).toHaveText('Context');
        await expect(header.getByRole('button', {name: 'Open row actions'})).toHaveCount(0);
    });

    test('the description and test column toggles show their columns and their pressed state', async ({page}) => {
        await openBoxedEditorStory(page, 'test-cases-and-test-runner');
        const description = page.locator('[data-column="description"]');
        const results = page.locator('[data-column="test-results"]');
        await expect(description).not.toHaveCount(0);
        await expect(results).toHaveCount(0);

        await page.getByRole('button', {name: 'Hide description'}).click();
        await expect(description).toHaveCount(0);
        await expect(page.getByRole('button', {name: 'Show description'})).toHaveAttribute('aria-pressed', 'false');

        await page.getByRole('button', {name: 'Show test column'}).click();
        await expect(results).not.toHaveCount(0);
        await expect(page.getByRole('button', {name: 'Hide test column'})).toHaveAttribute('aria-pressed', 'true');
    });

    test('showing the test column runs the first case, and the next case runs on navigation', async ({page}) => {
        await openBoxedEditorStory(page, 'test-cases-and-test-runner');
        await page.getByRole('button', {name: 'Show test column'}).click();
        const payment = page.getByTestId('row-payment').locator('[data-column="test-results"]');
        await expect(payment).toHaveText('6,666.667');

        await page.getByRole('button', {name: 'Next test case'}).click();
        await expect(page.getByTestId('row-*')).toContainText('2/3');
        await expect(payment).toHaveText('20,833.333');
    });
});
