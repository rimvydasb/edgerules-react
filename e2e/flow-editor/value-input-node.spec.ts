import {test, expect, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';

const PREFIX = 'components-flow-editor-value-input-node--';

async function open(page: Page, story: string) {
    await openStory(page, `${PREFIX}${story}`);
    // xyflow hides a node until it is measured.
    await expect(page.getByTestId('value-input-node-age')).toBeVisible({timeout: 15_000});
}

test('a value input shows one primitive value with one pin and feeds its function', async ({page}) => {
    await open(page, 'default');

    const age = page.getByTestId('value-input-node-age');
    await expect(age).toContainText('number');
    await expect(age.getByRole('button', {name: 'Value of age'})).toHaveText('23');
    await expect(page.locator('.react-flow__node[data-id="age"] [data-handleid]')).toHaveCount(1);
    await expect(page.locator('[data-testid="rf__edge-score:age"]')).toHaveCount(1);
    await expect(page.getByTestId('output-node-output').getByTestId('output-value')).toHaveText('346');
});

test('editing the value recalculates what reads it', async ({page}) => {
    await open(page, 'default');

    await page.getByRole('button', {name: 'Value of age'}).click();
    const editor = page.getByTestId('value-editor-age').locator('.cm-content');
    await editor.press('ControlOrMeta+a');
    await editor.pressSequentially('30');
    await editor.press('Enter');
    await expect(page.getByTestId('output-node-output').getByTestId('output-value')).toHaveText('360');
});

test('read-only shows the value as code, with no node menu', async ({page}) => {
    await open(page, 'read-only');

    const age = page.getByTestId('value-input-node-age');
    await expect(age).toContainText('23');
    await expect(age.getByRole('button', {name: 'Value of age'})).toHaveCount(0);
    await expect(age.getByRole('button', {name: 'Node actions'})).toHaveCount(0);
});
