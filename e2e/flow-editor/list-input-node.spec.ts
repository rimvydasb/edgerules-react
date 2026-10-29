import {test, expect, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';

const PREFIX = 'components-flow-editor-list-input-node--';

async function open(page: Page, story: string) {
    await openStory(page, `${PREFIX}${story}`);
    // xyflow hides a node until it is measured.
    await expect(page.getByTestId('list-input-node-people')).toBeVisible({timeout: 15_000});
}

function handles(page: Page, nodeId: string) {
    return page.locator(`.react-flow__node[data-id="${nodeId}"] [data-handleid]`);
}

test('a list input has one pin for the whole list and shows the item shape', async ({page}) => {
    await open(page, 'default');

    await expect(handles(page, 'people')).toHaveCount(1);
    await expect(handles(page, 'people').first()).toHaveAttribute('data-handleid', 'out:*');
    const people = page.getByTestId('list-input-node-people');
    await expect(people).toContainText('object[] · 3 items');
    for (const name of ['id', 'name', 'age']) await expect(people.getByTitle(new RegExp(`^${name} : `))).toBeVisible();
    await expect(page.getByTestId('list-input-node-scores')).toContainText('A list of number values.');
});

test('each list feeds its function through the whole-list pin', async ({page}) => {
    await open(page, 'default');

    await expect(page.locator('[data-testid="rf__edge-pick:people"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="rf__edge-sumScores:values"]')).toHaveCount(1);
    await expect(page.getByTestId('output-node-output').getByTestId('output-value')).toHaveText('51');
});

test('read-only has no node menu', async ({page}) => {
    await open(page, 'read-only');

    await expect(page.getByTestId('list-input-node-people').getByRole('button', {name: 'Node actions'})).toHaveCount(0);
});
