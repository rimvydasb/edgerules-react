import {test, expect, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';

const PREFIX = 'components-flow-editor-function-node--';

async function open(page: Page, story: string) {
    await openStory(page, `${PREFIX}${story}`);
    // xyflow hides a node until it is measured.
    await expect(page.locator('.react-flow__node').first()).toBeVisible({timeout: 15_000});
}

function handle(page: Page, nodeId: string, handleId: string) {
    return page.locator(`.react-flow__node[data-id="${nodeId}"] [data-handleid="${handleId}"]`);
}

test('picks a callee for a new node', async ({page}) => {
    await open(page, 'no-callee');

    await page.getByRole('button', {name: 'Select callee'}).click();
    await page.getByPlaceholder('Search functions and rulesets').fill('credit');
    await page.getByRole('option', {name: /creditScore\(age, income\)/}).click();

    await expect(page.getByRole('button', {name: 'Callee creditScore'})).toBeVisible();
    await expect(page.getByText('ARGUMENTS')).toBeVisible();
    await expect(page.getByText('draft', {exact: true})).toBeVisible();
});

test('the callee list holds user functions and rulesets only', async ({page}) => {
    await open(page, 'no-callee');

    await page.getByRole('button', {name: 'Select callee'}).click();
    await expect(page.getByText('Functions', {exact: true})).toBeVisible();
    await expect(page.getByText('Rulesets', {exact: true})).toBeVisible();
    await expect(page.getByRole('option', {name: /^risk\(/})).toBeVisible();
    await expect(page.getByRole('option', {name: /^sum\(/})).toHaveCount(0);
});

test('wiring the open arguments completes a draft node', async ({page}) => {
    await open(page, 'wired-draft');
    await expect(page.getByText('draft', {exact: true})).toBeVisible();

    for (const name of ['income', 'segment']) {
        await handle(page, 'applicant', `out:${name}`).dragTo(handle(page, 'node', `in:${name}`));
    }

    await expect(page.getByText('draft', {exact: true})).toHaveCount(0);
    await expect(page.locator('.react-flow__edge')).toHaveCount(4);
});

test('renames a result', async ({page}) => {
    await open(page, 'default');

    await page.getByRole('button', {name: 'level', exact: true}).click();
    const input = page.getByLabel('Rename result level');
    await input.fill('tier');
    await input.press('Enter');

    await expect(page.getByRole('button', {name: 'tier', exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'level', exact: true})).toHaveCount(0);
});

test('the unnamed return of a function cannot be renamed', async ({page}) => {
    await open(page, 'unnamed-return');

    await expect(page.getByLabel(/Rename result/)).toHaveCount(0);
    await page.getByTitle(/Unnamed return of monthly/).click();
    await expect(page.getByLabel(/Rename result/)).toHaveCount(0);
});

test('adds and removes a description', async ({page}) => {
    await open(page, 'default');
    const description = 'Assess the risk band';

    await page.getByRole('button', {name: 'Node actions'}).click();
    await page.getByRole('menuitem', {name: 'Add description'}).click();
    const input = page.getByLabel('Description of decision');
    await input.fill(description);
    await input.press('Enter');
    await expect(page.getByText(description)).toBeVisible();

    await page.getByRole('button', {name: 'Node actions'}).click();
    await page.getByRole('menuitem', {name: 'Remove description'}).click();
    await expect(page.getByText(description)).toHaveCount(0);
});

test('Escape keeps the old description', async ({page}) => {
    await open(page, 'default');
    const text = 'Assess the risk band';

    await page.getByRole('button', {name: 'Node actions'}).click();
    await page.getByRole('menuitem', {name: 'Add description'}).click();
    const added = page.getByLabel('Description of decision');
    await added.fill(text);
    await added.press('Enter');

    await page.getByText(text).click();
    const input = page.getByLabel('Description of decision');
    await input.fill('discarded');
    await input.press('Escape');

    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByText('discarded')).toHaveCount(0);
});

test('the argument menu disables Delete argument for a used parameter', async ({page}) => {
    await open(page, 'default');

    await page.getByRole('button', {name: 'Actions for argument age'}).click();
    await expect(page.getByRole('menuitem', {name: 'Move up'})).toHaveAttribute('data-disabled', 'true');
    await expect(page.getByRole('menuitem', {name: 'Delete argument'})).toHaveAttribute('data-disabled', 'true');
});

test('renames the node and keeps the editor open', async ({page}) => {
    await open(page, 'default');

    await page.getByRole('button', {name: 'Node actions'}).click();
    await page.getByRole('menuitem', {name: 'Rename node'}).click();
    const name = page.getByLabel(/Name of node /);
    await expect(name).toBeVisible();
    // The menu returns focus to its trigger after closing; that blur used to commit and close the editor.
    await page.waitForTimeout(500);
    await expect(name).toBeVisible();
    await name.fill('Risk tier');
    await name.press('Enter');

    // The node title shows the '@node-name' annotation once the edit is committed.
    await expect(name).toHaveCount(0);
    await expect(page.locator('strong', {hasText: 'Risk tier'})).toBeVisible();
});
