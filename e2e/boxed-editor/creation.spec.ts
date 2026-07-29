import {expect, test} from '@playwright/test';
import {
    chooseRowAction,
    commitExpression,
    expectLiveModel,
    expectRowError,
    openBoxedEditorStory,
} from './helpers';

test.describe('Boxed Editor / creation', () => {
    test('creates a complex type at the model root and links', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');

        await chooseRowAction(page, '*', 'Add type');

        await expect(page.getByTestId('row-Type')).toBeVisible();
        await expectLiveModel(page, /"Type":\{"@kind":"type-definition"\}/);
        await expect(page.getByTestId('live-result')).toHaveText('{}');
    });

    test('creates a complex type inside a nested context', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add field');
        await chooseRowAction(page, 'field', 'Convert to context');

        await chooseRowAction(page, 'field', 'Add type');

        await expect(page.getByTestId('row-field.Type')).toBeVisible();
        await expectLiveModel(page, /"field":\{"@kind":"context","Type":\{"@kind":"type-definition"\}\}/);
    });

    test('adds fields to a newly created complex type', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add type');

        await chooseRowAction(page, 'Type', 'Add field');
        await chooseRowAction(page, 'Type', 'Add field');

        await expect(page.getByTestId('row-Type.field')).toBeVisible();
        await expect(page.getByTestId('row-Type.field2')).toBeVisible();
        await expectLiveModel(page, /"Type":\{"@kind":"type-definition","field":"string","field2":"string"\}/);
    });

    test('references a newly created complex type from a field annotation', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add type');
        await chooseRowAction(page, '*', 'Add field');

        await commitExpression(page, 'field', '<Type, required: true>');

        await expectLiveModel(page, /"field":\{"@kind":"type","type":"Type","required":true\}/);
        await expect(page.getByTestId('live-result')).not.toHaveText(/^error:/);
    });

    test('creates every construct the model root offers one after another', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        const actions = [
            ['Add field', 'field'],
            ['Add type', 'Type'],
            ['Add function', 'function'],
            ['Add decision table', 'decisionTable'],
            ['Add relation', 'relation'],
            ['Add list', 'list'],
            ['Add optimisation', 'optimisation'],
        ] as const;

        for (const [action, path] of actions) {
            await chooseRowAction(page, '*', action);
            await expect(page.getByTestId(`row-${path}`)).toBeVisible();
            await expect(page.getByTestId('live-model')).toContainText(`"${path}"`);
        }

        await chooseRowAction(page, 'Type', 'Add field');
        await chooseRowAction(page, 'function', 'Add argument');
        await page.getByTestId('append-function').click();
        await chooseRowAction(page, 'decisionTable', 'Add condition column');
        await chooseRowAction(page, 'decisionTable', 'Add action column');
        await page.getByTestId('append-decisionTable').click();
        await chooseRowAction(page, 'relation', 'Add column');
        await page.getByTestId('append-relation').click();
        await page.getByTestId('append-list').click();
        await page.getByTestId('append-optimisation.variables').click();
        await page.getByTestId('append-optimisation.constraints').click();

        for (const path of [
            'Type.field',
            'function.field',
            'decisionTable.rules[0]',
            'relation[1]',
            'list[0]',
            'optimisation.variables.variable',
            'optimisation.constraints.constraint',
        ]) {
            await expect(page.getByTestId(`row-${path}`)).toBeVisible();
        }
    });

    test('offers Add optimisation on the model root and never inside a context', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add field');
        await chooseRowAction(page, 'field', 'Convert to context');

        await page.getByTestId('row-*').getByRole('button', {name: 'Open row actions'}).click();
        await expect(page.getByRole('menuitem', {name: 'Add optimisation'})).toBeVisible();
        await page.keyboard.press('Escape');

        await page.getByTestId('row-field').getByRole('button', {name: 'Open row actions'}).click();
        await expect(page.getByRole('menuitem', {name: 'Add optimisation'})).toHaveCount(0);
    });

    test('appends a record to a relation whose columns are numeric and commits it', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add relation');
        await chooseRowAction(page, 'relation', 'Add column');
        await commitExpression(page, 'relation[0]', '7');

        await page.getByTestId('append-relation').click();

        await expect(page.getByTestId('row-relation[1]')).toBeVisible();
        await expect(page.getByTestId('live-result')).toHaveText('{"relation":[{"column":7},{"column":0}]}');
    });

    test('appends a record to a relation whose columns are boolean and commits it', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add relation');
        await chooseRowAction(page, 'relation', 'Add column');
        await commitExpression(page, 'relation[0]', 'true');

        await page.getByTestId('append-relation').click();

        await expect(page.getByTestId('row-relation[1]')).toBeVisible();
        await expect(page.getByTestId('live-result')).toHaveText(
            '{"relation":[{"column":true},{"column":false}]}',
        );

        await chooseRowAction(page, '*', 'Add relation');
        await chooseRowAction(page, 'relation2', 'Add column');
        await commitExpression(page, 'relation2[0]', '@"2026-07-29"');
        await page.getByTestId('append-relation2').click();
        await expect(page.getByTestId('live-result')).toContainText(
            '"relation2":[{"column":"2026-07-29"},{"column":"2026-07-29"}]',
        );
    });

    test('appends a record to an empty relation with no columns yet', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add relation');

        await page.getByTestId('append-relation').click();

        await expect(page.getByTestId('row-relation[1]')).toBeVisible();
        await expect(page.getByTestId('live-result')).toHaveText('{"relation":[{},{}]}');
    });

    test('appends numeric and boolean list items with type-compatible defaults', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add list');
        await page.getByTestId('append-list').click();
        await commitExpression(page, 'list[0]', '7');
        await page.getByTestId('append-list').click();
        await chooseRowAction(page, '*', 'Add list');
        await page.getByTestId('append-list2').click();
        await commitExpression(page, 'list2[0]', 'true');
        await page.getByTestId('append-list2').click();

        await expect(page.getByTestId('live-result')).toContainText('"list":[7,0]');
        await expect(page.getByTestId('live-result')).toContainText('"list2":[true,false]');
    });

    test('auto-names successive constructs of the same kind without collision', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');

        await chooseRowAction(page, '*', 'Add function');
        await chooseRowAction(page, '*', 'Add function');
        await chooseRowAction(page, '*', 'Add function');

        await expect(page.getByTestId('row-function')).toBeVisible();
        await expect(page.getByTestId('row-function2')).toBeVisible();
        await expect(page.getByTestId('row-function3')).toBeVisible();
        await expectLiveModel(page, /"function".*"function2".*"function3"/);
    });

    test('shows a visible error instead of a silent no-op when creation is rejected', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');
        await chooseRowAction(page, '*', 'Add field');
        await commitExpression(page, 'field', 'function()');

        await chooseRowAction(page, 'function', 'Add argument');

        await expectRowError(page, 'function', /argument|parameter|call|link/i);
    });
});
