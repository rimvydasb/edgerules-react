import {test, expect, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';

const PREFIX = 'components-flow-editor-list-input-node--';

async function open(page: Page, story: string, field = 'people') {
    await openStory(page, `${PREFIX}${story}`);
    // xyflow hides a node until it is measured.
    await expect(page.getByTestId(`list-input-node-${field}`)).toBeVisible({timeout: 15_000});
}

function handles(page: Page, nodeId: string) {
    return page.locator(`.react-flow__node[data-id="${nodeId}"] [data-handleid]`);
}

test('a list input has one pin for the whole list and shows its items', async ({page}) => {
    await open(page, 'default');

    await expect(handles(page, 'people')).toHaveCount(1);
    await expect(handles(page, 'people').first()).toHaveAttribute('data-handleid', 'out:*');
    const people = page.getByTestId('list-input-node-people');
    await expect(people).toContainText('object[] · 3 items');
    await expect(people.getByTestId('list-input-table').getByRole('columnheader')).toHaveText([
        '#',
        'id',
        'name',
        'age',
    ]);
    await expect(people.getByTestId('list-input-table')).toContainText('Ann');
    await expect(page.getByTestId('list-input-node-scores').getByTestId('list-input-table')).toContainText('30');
});

test('a list of plain values shows one row per value', async ({page}) => {
    await open(page, 'primitive-list', 'cities');

    const table = page.getByTestId('list-input-node-cities').getByTestId('list-input-table');
    await expect(table.getByRole('columnheader')).toHaveText(['#', 'value']);
    await expect(table.getByRole('row')).toHaveCount(5);
});

test('a long list shows 10 items, then a row of …', async ({page}) => {
    await open(page, 'long-list', 'rates');

    const table = page.getByTestId('list-input-node-rates').getByTestId('list-input-table');
    await expect(table.getByRole('row')).toHaveCount(12);
    await expect(table.getByTestId('list-input-more-rows')).toBeVisible();
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
