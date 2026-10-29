import {test, expect, type Locator, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';

const PREFIX = 'components-flow-editor-canvas--';

async function open(page: Page, story: string) {
    await openStory(page, `${PREFIX}${story}`);
    await expect(page.getByTestId('flow-editor')).toBeVisible({timeout: 15_000});
}

async function openSeeded(page: Page, story = 'default') {
    await open(page, story);
    // xyflow hides a node until it is measured.
    await expect(page.getByTestId('function-node-decision')).toBeVisible({timeout: 15_000});
}

function node(page: Page, id: string) {
    return page.locator(`.react-flow__node[data-id="${id}"]`);
}

function handle(page: Page, nodeId: string, handleId: string) {
    return node(page, nodeId).locator(`[data-handleid="${handleId}"]`);
}

function paletteItem(page: Page, name: string) {
    return page.getByRole('navigation', {name: 'Node palette'}).getByRole('button', {name, exact: true});
}

async function box(locator: Locator) {
    const result = await locator.boundingBox();
    if (!result) throw new Error('element has no box');
    return result;
}

function overlaps(a: {x: number; y: number; width: number; height: number}, b: typeof a) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// The layout runs again once xyflow has measured the nodes, then the view fits them.
async function expectColumnLayout(page: Page) {
    await expect
        .poll(async () => {
            const [applicant, decision, score, output] = await Promise.all(
                ['applicant', 'decision', 'score', 'output'].map((id) => box(node(page, id))),
            );
            return (
                applicant.x + applicant.width < decision.x &&
                decision.x + decision.width < output.x &&
                !overlaps(decision, score)
            );
        })
        .toBe(true);
}

test.describe('canvas', () => {
    test('draws the flow nodes of the model, their wires and the output values', async ({page}) => {
        await openSeeded(page);

        await expect(page.getByTestId('object-input-node-applicant')).toBeVisible();
        await expect(page.getByTestId('function-node-score')).toBeVisible();
        await expect(page.getByTestId('output-node-output')).toContainText("'high'");
        await expect(page.getByTestId('output-node-output2')).toContainText('371');
        // decision: 3 arguments, score: 2 arguments, 2 outputs.
        await expect(page.locator('.react-flow__edge')).toHaveCount(7);
        await expect(page.getByTestId('flow-editor-empty')).toHaveCount(0);
    });

    test('the automatic layout puts nodes in data-flow columns without overlaps', async ({page}) => {
        await openSeeded(page);

        await expectColumnLayout(page);
    });

    test('Arrange nodes puts back a node that was dragged onto another', async ({page}) => {
        await openSeeded(page);
        await expectColumnLayout(page);
        const decision = await box(node(page, 'decision'));
        const title = await box(page.getByTestId('function-node-score').locator('strong').first());
        await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
        await page.mouse.down();
        await page.mouse.move(decision.x + 40, decision.y + 20, {steps: 8});
        await page.mouse.up();
        expect(overlaps(await box(node(page, 'decision')), await box(node(page, 'score')))).toBe(true);

        await page.getByRole('button', {name: 'Arrange nodes'}).click();

        await expectColumnLayout(page);
    });

    test('shows the empty state on a model without flow nodes', async ({page}) => {
        await open(page, 'empty');
        await expect(page.getByTestId('flow-editor-empty')).toContainText('This flow has no nodes yet');
        await expect(page.locator('.react-flow__node')).toHaveCount(0);
    });

    test('has zoom, fit view and overview controls', async ({page}) => {
        await openSeeded(page);
        await expect(page.getByRole('button', {name: 'Zoom In'})).toBeVisible();
        await expect(page.getByRole('button', {name: 'Fit View'})).toBeVisible();
        await expect(page.getByRole('button', {name: 'Arrange nodes'})).toBeVisible();
        await expect(page.locator('.react-flow__minimap')).toBeVisible();
    });
});

test.describe('palette', () => {
    test('lists every node type, grouped, with the model records and callees', async ({page}) => {
        await open(page, 'empty');
        const palette = page.getByRole('navigation', {name: 'Node palette'});

        for (const group of ['Inputs', 'Functions & rulesets', 'Outputs']) {
            await expect(palette.getByRole('region', {name: group})).toBeVisible();
        }
        for (const name of [
            'Add new input',
            'Add input applicant',
            'Add input application',
            'Add function call',
            'Add ruleset risk',
            'Add function creditScore',
            'Add function monthly',
            'Add output',
        ]) {
            await expect(paletteItem(page, name)).toBeVisible();
        }
        await expect(paletteItem(page, 'Add ruleset risk')).toContainText('(age, income, segment) → { level, limit }');
    });

    test('search narrows the items and says when nothing matches', async ({page}) => {
        await open(page, 'empty');
        const search = page.getByRole('textbox', {name: 'Search nodes'});

        await search.fill('credit');
        await expect(paletteItem(page, 'Add function creditScore')).toBeVisible();
        await expect(paletteItem(page, 'Add ruleset risk')).toHaveCount(0);
        await expect(page.getByRole('region', {name: 'Outputs'})).toHaveCount(0);

        await search.fill('zzz');
        await expect(page.getByText('No nodes match “zzz”')).toBeVisible();

        await page.getByRole('button', {name: 'Clear search'}).click();
        await expect(paletteItem(page, 'Add ruleset risk')).toBeVisible();
    });

    test('a record that becomes an input leaves the palette', async ({page}) => {
        await openSeeded(page);
        await expect(paletteItem(page, 'Add input application')).toBeVisible();
        await expect(paletteItem(page, 'Add input applicant')).toHaveCount(0);
    });

    test('collapses to a rail and expands again', async ({page}) => {
        await open(page, 'empty');

        await page.getByRole('button', {name: 'Hide node palette'}).click();
        await expect(page.getByRole('textbox', {name: 'Search nodes'})).toHaveCount(0);
        await expect(paletteItem(page, 'Add function call')).toBeVisible();

        // The rail still adds nodes.
        await paletteItem(page, 'Add output').click();
        await expect(page.getByTestId('output-node-output')).toBeVisible({timeout: 15_000});

        await page.getByRole('button', {name: 'Show node palette'}).click();
        await expect(page.getByRole('textbox', {name: 'Search nodes'})).toBeVisible();
    });
});

test.describe('adding nodes', () => {
    test('clicking a callee adds a draft function node with that callee', async ({page}) => {
        await open(page, 'empty');

        await paletteItem(page, 'Add ruleset risk').click();

        const added = page.getByTestId('function-node-node');
        await expect(added).toBeVisible({timeout: 15_000});
        await expect(added.getByRole('button', {name: 'Callee risk'})).toBeVisible();
        await expect(added.getByText('draft', {exact: true})).toBeVisible();
        await expect(node(page, 'node')).toHaveClass(/selected/);
        await expect(page.getByTestId('flow-editor-empty')).toHaveCount(0);
    });

    test('clicking Function call adds a node without a callee', async ({page}) => {
        await open(page, 'empty');
        await paletteItem(page, 'Add function call').click();
        await expect(page.getByTestId('function-node-node')).toContainText('Pick a function or ruleset', {
            timeout: 15_000,
        });
    });

    test('clicking twice places the second node below the first', async ({page}) => {
        await open(page, 'empty');
        await paletteItem(page, 'Add function monthly').click();
        await expect(node(page, 'node')).toBeVisible({timeout: 15_000});
        await paletteItem(page, 'Add function monthly').click();
        await expect(node(page, 'node2')).toBeVisible({timeout: 15_000});

        const first = await box(node(page, 'node'));
        const second = await box(node(page, 'node2'));
        expect(overlaps(first, second)).toBe(false);
        expect(second.y).toBeGreaterThan(first.y);
    });

    test('dragging an existing record onto the canvas drops an input node there', async ({page}) => {
        await open(page, 'empty');
        const canvas = await box(page.locator('.react-flow__pane'));
        const target = {x: canvas.x + canvas.width - 300, y: canvas.y + 60};

        await paletteItem(page, 'Add input application').dragTo(page.locator('.react-flow__pane'), {
            targetPosition: {x: target.x - canvas.x, y: target.y - canvas.y},
        });

        const added = node(page, 'application');
        await expect(added).toBeVisible({timeout: 15_000});
        const dropped = await box(added);
        // The node's top-left corner lands on the drop point, snapped to the 20px grid.
        expect(Math.abs(dropped.x - target.x)).toBeLessThan(30);
        expect(Math.abs(dropped.y - target.y)).toBeLessThan(30);
        await expect(paletteItem(page, 'Add input application')).toHaveCount(0);
    });

    test('dragging New input creates a record with one field', async ({page}) => {
        await open(page, 'empty');

        await paletteItem(page, 'Add new input').dragTo(page.locator('.react-flow__pane'));

        const added = page.getByTestId('object-input-node-input');
        await expect(added).toBeVisible({timeout: 15_000});
        await expect(added.getByRole('button', {name: 'value', exact: true})).toBeVisible();
        await expect(handle(page, 'input', 'out:value')).toBeVisible();
    });

    test('dragging a callee and an output builds a working flow', async ({page}) => {
        await open(page, 'empty');
        const pane = page.locator('.react-flow__pane');
        const canvas = await box(pane);

        await paletteItem(page, 'Add input application').dragTo(pane, {targetPosition: {x: 40, y: 60}});
        await expect(node(page, 'application')).toBeVisible({timeout: 15_000});
        await paletteItem(page, 'Add function monthly').dragTo(pane, {targetPosition: {x: 420, y: 60}});
        await expect(node(page, 'node')).toBeVisible({timeout: 15_000});
        await paletteItem(page, 'Add output').dragTo(pane, {
            targetPosition: {x: Math.min(860, canvas.width - 260), y: 60},
        });
        await expect(node(page, 'output')).toBeVisible({timeout: 15_000});

        await handle(page, 'application', 'out:amount').dragTo(handle(page, 'node', 'in:amount'));
        await expect(page.getByTestId('function-node-node').getByText('draft', {exact: true})).toHaveCount(0);
        await handle(page, 'node', 'out:result').dragTo(handle(page, 'output', 'in:value'));

        await expect(page.locator('.react-flow__edge')).toHaveCount(2);
        await expect(page.getByTestId('output-value')).toContainText('2666.66');
    });
});

test.describe('removing', () => {
    test('Delete removes a node from the flow; its record is offered again', async ({page}) => {
        await openSeeded(page);

        await page.getByTestId('object-input-node-applicant').locator('strong').first().click();
        await page.keyboard.press('Delete');

        await expect(node(page, 'applicant')).toHaveCount(0);
        await expect(paletteItem(page, 'Add input applicant')).toBeVisible();
        // The field stays in the model, so the bindings and the output values stay.
        await expect(page.getByTestId('output-node-output')).toContainText("'high'");
        await expect(page.locator('.react-flow__edge')).toHaveCount(2);
    });

    test('deleting a wire unbinds the argument and the node turns into a draft', async ({page}) => {
        await openSeeded(page);

        await page.locator('[data-testid="rf__edge-score:income"]').click({force: true});
        await page.keyboard.press('Delete');

        await expect(page.locator('[data-testid="rf__edge-score:income"]')).toHaveCount(0);
        await expect(page.getByTestId('function-node-score').getByText('draft', {exact: true})).toBeVisible();
    });

    test('Delete on an output removes it', async ({page}) => {
        await openSeeded(page);

        await page.getByTestId('output-node-output2').locator('strong').click();
        await page.keyboard.press('Delete');

        await expect(node(page, 'output2')).toHaveCount(0);
        await expect(node(page, 'output')).toBeVisible();
    });
});

test.describe('read-only', () => {
    test('has no palette and ignores Delete', async ({page}) => {
        await openSeeded(page, 'read-only');

        await expect(page.getByRole('navigation', {name: 'Node palette'})).toHaveCount(0);
        await page.getByTestId('object-input-node-applicant').locator('strong').first().click();
        await page.keyboard.press('Delete');
        await expect(node(page, 'applicant')).toBeVisible();
    });
});

test.describe('layout', () => {
    test('reports positions and outputs after a node is added and moved', async ({page}) => {
        await open(page, 'layout-changes');
        const report = page.getByTestId('layout-json');
        await expect(report).toHaveText('no layout change yet');

        await paletteItem(page, 'Add output').click();
        await expect(node(page, 'output')).toBeVisible({timeout: 15_000});
        await expect(report).toContainText('"outputs":[{"id":"output"}]');
        const before = JSON.parse((await report.textContent()) ?? '{}').positions.output;

        const title = await box(page.getByTestId('output-node-output').locator('strong'));
        await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
        await page.mouse.down();
        await page.mouse.move(title.x + 200, title.y + 100, {steps: 8});
        await page.mouse.up();

        await expect
            .poll(async () => JSON.parse((await report.textContent()) ?? '{}').positions.output.x)
            .toBeGreaterThan(before.x);
    });
});

test.describe('input values', () => {
    async function editValue(page: Page, name: string, text: string) {
        await page.getByRole('button', {name: `Value of ${name}`}).click();
        await expect(page.getByTestId(`value-editor-${name}`).locator('.cm-content')).toBeFocused();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type(text);
        await page.keyboard.press('Enter');
    }

    test('editing an input value recalculates the output nodes', async ({page}) => {
        await openSeeded(page);
        await expect(page.getByTestId('output-node-output')).toContainText("'high'");
        await expect(page.getByTestId('output-node-output2')).toContainText('371');

        // risk: age 30 matches the second rule; creditScore: 300 + 30 * 2 + 25000 / 1000.
        await editValue(page, 'age', '30');

        await expect(page.getByRole('button', {name: 'Value of age'})).toHaveText('30');
        await expect(page.getByTestId('output-node-output')).toContainText("'medium'");
        await expect(page.getByTestId('output-node-output2')).toContainText('385');
    });

    test('an expression value recalculates the output nodes', async ({page}) => {
        await openSeeded(page);

        await editValue(page, 'income', '25000 + 15000');

        // creditScore: 300 + 23 * 2 + 40000 / 1000.
        await expect(page.getByTestId('output-node-output2')).toContainText('386');
        // risk: income 40000 no longer matches the first rule, and age 23 not the second.
        await expect(page.getByTestId('output-node-output')).toContainText("'none'");
    });

    test('an invalid value shows the error and leaves the outputs unchanged', async ({page}) => {
        await openSeeded(page);

        await editValue(page, 'age', '30 +');

        await expect(page.getByTestId('object-input-node-applicant').getByRole('alert')).toBeVisible();
        await expect(page.getByTestId('value-editor-age')).toBeVisible();
        await expect(page.getByTestId('output-node-output')).toContainText("'high'");
        await expect(page.getByTestId('output-node-output2')).toContainText('371');

        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', {name: 'Value of age'})).toHaveText('23');
        await expect(page.getByTestId('object-input-node-applicant').getByRole('alert')).toHaveCount(0);
    });

    test('typing in a value does not delete the selected node', async ({page}) => {
        await openSeeded(page);

        await page.getByRole('button', {name: 'Value of age'}).click();
        await expect(page.getByTestId('value-editor-age').locator('.cm-content')).toBeFocused();
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await page.keyboard.type('41');
        await page.keyboard.press('Enter');

        await expect(page.getByTestId('object-input-node-applicant')).toBeVisible();
        await expect(page.getByRole('button', {name: 'Value of age'})).toHaveText('41');
        await expect(page.getByTestId('output-node-output2')).toContainText('407');
    });
});
