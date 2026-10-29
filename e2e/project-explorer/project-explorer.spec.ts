import {test, expect} from '@playwright/test';
import {openStory} from '../support/storybook';

// Smoke-level only: RTL (ProjectExplorer.test.tsx) already covers behavior in detail against the
// real engine. This just confirms the built artifact (post-tsdown, post-Storybook-build) actually
// renders in a real browser, driving the same stories over the real `@edgerules/web` engine.

test('Default story renders the five sections', async ({page}) => {
    await openStory(page, 'components-project-explorer--default');
    for (const section of ['Types', 'Methods', 'Variables', 'Workbooks', 'Tests']) {
        await expect(page.getByText(section, {exact: true})).toBeVisible();
    }
});

test('Expanded story reveals the entries of every section and the nodes of a workbook', async ({page}) => {
    await openStory(page, 'components-project-explorer--expanded');
    await expect(page.getByText('Person', {exact: true})).toBeVisible();
    await expect(page.getByText('nested.deep()', {exact: true})).toBeVisible();
    await expect(page.getByText('globalConst', {exact: true})).toBeVisible();
    await expect(page.getByText('decision', {exact: true})).toBeVisible();
    await expect(page.getByText('Model', {exact: true})).toBeVisible();
});

test('CreateEntity story offers the method kinds', async ({page}) => {
    await openStory(page, 'components-project-explorer--create-entity');
    await expect(page.getByRole('menuitem', {name: 'Function'})).toBeVisible();
    await expect(page.getByRole('menuitem', {name: 'Ruleset'})).toBeVisible();
});
