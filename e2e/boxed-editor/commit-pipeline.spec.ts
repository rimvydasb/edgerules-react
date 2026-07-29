import {expect, test} from '@playwright/test';
import {
    chooseRowAction,
    columnHeaders,
    commitExpression,
    expectLiveModel,
    expectNoRowError,
    expectRowError,
    openBoxedEditorStory,
} from './helpers';

test.describe('Boxed Editor / commit pipeline', () => {
    test('adds two arguments in a row to a brand-new function and keeps both distinct', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');

        await chooseRowAction(page, 'function', 'Add argument');
        await chooseRowAction(page, 'function', 'Add argument');

        await expect.poll(() => columnHeaders(page, 'function')).toEqual(['arg', 'arg2']);
        await expect(page.getByTestId('live-result')).toHaveText('{}');
    });

    test('adds two arguments to a function nested inside a context and keeps both distinct', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add field');
        await chooseRowAction(page, 'field', 'Convert to context');
        await chooseRowAction(page, 'field', 'Add function');

        await chooseRowAction(page, 'field.function', 'Add argument');
        await chooseRowAction(page, 'field.function', 'Add argument');

        await expect.poll(() => columnHeaders(page, 'field.function')).toEqual(['arg', 'arg2']);
        await expect(page.getByTestId('live-result')).toHaveText('{"field":{}}');
    });

    test('adds five arguments one at a time without losing any earlier argument', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');

        for (let count = 1; count <= 5; count += 1) {
            await chooseRowAction(page, 'function', 'Add argument');
            const expected = Array.from({length: count}, (_, index) => (index === 0 ? 'arg' : `arg${index + 1}`));
            await expect.poll(() => columnHeaders(page, 'function')).toEqual(expected);
            await expect(page.getByTestId('live-result')).toHaveText('{}');
        }
    });

    test('executes the function successfully after each argument is added', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');

        for (let count = 1; count <= 5; count += 1) {
            if (count > 1) await chooseRowAction(page, 'field', 'Delete');
            await chooseRowAction(page, 'function', 'Add argument');
            if (count === 1) await commitExpression(page, 'function.result', 'arg');

            await chooseRowAction(page, '*', 'Add field');
            const names = Array.from({length: count}, (_, index) => (index === 0 ? 'arg' : `arg${index + 1}`));
            const invocation = `function(${names.map((name, index) => `${name}: ${index + 1}`).join(', ')})`;
            await commitExpression(page, 'field', invocation);
            await expect(page.getByTestId('live-result')).toHaveText('{"field":1}');
        }
    });

    test('shows a visible error when a menu action commit is rejected', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        const before = await page.getByTestId('live-model').textContent();

        await chooseRowAction(page, 'payment', 'Delete "amount" argument');

        await expectRowError(page, 'payment', /amount|reference|link/i);
        await expectLiveModel(page, before ?? '');
    });

    test('commits a trailing optimisation append when the engine accepts it', async ({page}) => {
        await openBoxedEditorStory(page, 'optimisation-crud');

        await page.getByTestId('append-factory.variables').click();

        await expect(page.getByTestId('row-factory.variables.variable')).toBeVisible();
        await expectLiveModel(page, /"variable"/);
    });

    test('clears a row error once its next mutation succeeds', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');

        await chooseRowAction(page, 'payment', 'Delete "amount" argument');
        await expectRowError(page, 'payment', /amount|reference|link/i);

        await chooseRowAction(page, 'payment', 'Duplicate');

        await expectNoRowError(page, 'payment');
        await expect(page.getByTestId('live-model')).toContainText('"payment2"');
    });

    test('keeps accepting unrelated edits after a rejected commit elsewhere', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');

        await chooseRowAction(page, 'payment', 'Delete "amount" argument');
        await expectRowError(page, 'payment', /amount|reference|link/i);
        await chooseRowAction(page, '*', 'Add field');

        await expect(page.getByTestId('row-field')).toBeVisible();
        await expect(page.getByTestId('live-model')).toContainText('"field"');
    });

    test('names the offending path in a model-level banner after a referenced row is deleted', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');

        await chooseRowAction(page, 'principal', 'Delete');

        await expect(page.getByTestId('model-error')).toContainText(/principal/i);
    });

    test('accepts an unrelated Add field while a dangling reference exists', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await chooseRowAction(page, 'principal', 'Delete');
        await expect(page.getByTestId('model-error')).toBeVisible();

        await chooseRowAction(page, '*', 'Add field');

        await expect(page.getByTestId('live-model')).toContainText('"field"');
        await expect(page.getByTestId('model-error')).toContainText(/principal/i);
    });

    test('clears the model-level banner once the dangling reference is repaired', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await chooseRowAction(page, 'principal', 'Delete');
        await expect(page.getByTestId('model-error')).toContainText(/principal/i);

        await commitExpression(page, 'result', 'payment(amount: 1200, term: months)');

        await expect(page.getByTestId('model-error')).toHaveCount(0);
        await expect(page.getByTestId('live-result')).toContainText('"result":100');
    });
});
