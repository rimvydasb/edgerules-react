import {expect, test} from '@playwright/test';
import {
    chooseRowAction,
    commitExpression,
    expectLiveModel,
    expectLiveResult,
    expectRowError,
    openBoxedEditorStory,
    renameRow,
    valueCell,
} from './helpers';

test.describe('Boxed Editor / functions', () => {
    test('creates a root function with blank result and no arguments', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');
        await expect(page.getByTestId('row-function.result')).toBeVisible();
        await expectLiveResult(page, '{}');
    });

    test('creates a function inside a nested context', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add field');
        await chooseRowAction(page, 'field', 'Convert to context');
        await chooseRowAction(page, 'field', 'Add function');
        await expect(page.getByTestId('row-field.function')).toBeVisible();
        await expectLiveResult(page, '{"field":{}}');
    });

    test('creates a function three levels deep with correct path math', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        let path = '*';
        for (const name of ['field', 'field.field', 'field.field.field']) {
            await chooseRowAction(page, path, 'Add field');
            await chooseRowAction(page, name, 'Convert to context');
            path = name;
        }
        await chooseRowAction(page, path, 'Add function');
        await expect(page.getByTestId('row-field.field.field.function')).toBeVisible();
        await expectLiveResult(page, '{"field":{"field":{"field":{}}}}');
    });

    test('auto-names successive functions without collision', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');
        await chooseRowAction(page, '*', 'Add function');
        await expect(page.getByTestId('row-function2')).toBeVisible();
        await expectLiveResult(page, '{}');
    });

    test('converts an inline body into a multi-statement body', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await page.getByTestId('append-payment').click();
        await expect(page.getByTestId('row-payment.field')).toBeVisible();
        await expectLiveResult(page, /"result":100/);
    });

    test('keeps synthesized result non-deletable and non-renameable', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await page.getByTestId('row-payment.result').getByRole('button', {name: 'Open row actions'}).click();
        await expect(page.getByRole('menuitem', {name: 'Delete', exact: true})).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(page.getByLabel('name payment.result')).toHaveCount(0);
        await expect(valueCell(page, 'payment.result')).toBeVisible();
        await expectLiveResult(page, /"result":100/);
    });

    test('edits an inline result and executes it', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await commitExpression(page, 'payment.result', 'amount * 2 / term');
        await expectLiveResult(page, /"result":200/);
    });

    test('edits an intermediate multi-statement field and executes', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await page.getByTestId('append-payment').click();
        await commitExpression(page, 'payment.field', 'amount + term');
        await expectLiveResult(page, /"result":100/);
    });

    test('collapses a reduced multi-statement body back to inline form', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await page.getByTestId('append-payment').click();
        await chooseRowAction(page, 'payment.field', 'Delete');
        await expectLiveModel(page, /"@body":\{"@kind":"expression"/);
        await expectLiveResult(page, /"result":100/);
    });

    test('deletes an unused argument', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');
        await chooseRowAction(page, 'function', 'Add argument');
        await chooseRowAction(page, 'function', 'Delete "arg" argument');
        await expectLiveModel(page, /"@parameters":\{\}/);
        await expectLiveResult(page, '{}');
    });

    test('rejects deleting a referenced argument visibly', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await chooseRowAction(page, 'payment', 'Delete "amount" argument');
        await expectRowError(page, 'payment', /amount|reference|link/i);
        await expectLiveModel(page, /"amount":"number"/);
    });

    test('deletes the only argument of a single-argument function', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');
        await chooseRowAction(page, 'function', 'Add argument');
        await commitExpression(page, 'function.result', '42');
        await chooseRowAction(page, 'function', 'Delete "arg" argument');
        await chooseRowAction(page, '*', 'Add field');
        await commitExpression(page, 'field', 'function()');
        await expectLiveResult(page, '{"field":42}');
    });

    test('calls a function with every argument supplied', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await expectLiveResult(page, /"result":100/);
    });

    test('adds an optional argument to a function already called elsewhere', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await chooseRowAction(page, 'payment', 'Add argument');
        await expectLiveResult(page, /"result":100/);
    });

    test('duplicates a function with auto-renaming', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await chooseRowAction(page, 'payment', 'Duplicate');
        await expect(page.getByTestId('row-payment2')).toBeVisible();
        await expectLiveResult(page, /"result":100/);
    });

    test('edits a duplicate without affecting the original', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await chooseRowAction(page, 'payment', 'Duplicate');
        await renameRow(page, 'payment2', 'alternate');
        await commitExpression(page, 'alternate.result', 'amount + term');
        await expectLiveResult(page, /"result":100/);
        await expectLiveModel(page, /"alternate"/);
    });

    test('deletes an unreferenced function', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await chooseRowAction(page, 'payment', 'Duplicate');
        await chooseRowAction(page, 'payment2', 'Delete');
        await expect(page.getByTestId('row-payment2')).toHaveCount(0);
        await expectLiveResult(page, /"result":100/);
    });

    test('reports a called-function deletion and accepts unrelated edits', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await chooseRowAction(page, 'payment', 'Delete');
        await expect(page.getByTestId('model-error')).toContainText(/payment|reference|link/i);
        await chooseRowAction(page, '*', 'Add field');
        await expect(page.getByTestId('row-field')).toBeVisible();
    });

    test('creates and executes a zero-argument function', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');
        await commitExpression(page, 'function.result', '42');
        await chooseRowAction(page, '*', 'Add field');
        await commitExpression(page, 'field', 'function()');
        await expectLiveResult(page, '{"field":42}');
    });

    test('executes a function referencing a sibling field', async ({page}) => {
        await openBoxedEditorStory(page, 'function-scope-playground');
        await expectLiveResult(page, /"siblingResult":15/);
    });

    test('executes a nested function referencing its enclosing context', async ({page}) => {
        await openBoxedEditorStory(page, 'function-scope-playground');
        await expectLiveResult(page, /"group":\{"offset":2,"result":5\}/);
    });
});
