import {expect, test} from '@playwright/test';
import {expectHeaders, moveHeader, renameHeader, retypeHeader} from './columnHelpers';
import {
    chooseRowAction,
    expectLiveModel,
    expectLiveResult,
    openBoxedEditorStory,
    replaceActiveExpression,
    valueCell,
} from './helpers';

test.describe('Boxed Editor / column headers', () => {
    test('renames a function argument and migrates every reference in the body', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await renameHeader(page, 'payment', 'amount', 'principal');
        await expectHeaders(page, 'payment', ['principal', 'term']);
        await expectLiveModel(page, /principal \/ term/);
        await expectLiveResult(page, /"result":100/);
    });

    test("renames a nested function's argument and migrates references at non-root depth", async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await renameHeader(page, 'group.nested', 'x', 'value');
        await expectLiveModel(page, /nested.*value.*value \+ 1/);
    });

    test('renames each of five arguments in turn, keeping every earlier rename intact', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');
        for (let index = 0; index < 5; index += 1) await chooseRowAction(page, 'function', 'Add argument');
        for (let index = 0; index < 5; index += 1) {
            const from = index === 0 ? 'arg' : `arg${index + 1}`;
            await renameHeader(page, 'function', from, `value${index + 1}`);
        }
        await expectHeaders(page, 'function', ['value1', 'value2', 'value3', 'value4', 'value5']);
    });

    test("renames a condition column and migrates every rule's when key with the header", async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await renameHeader(page, 'risk', 'age', 'years');
        await expectLiveModel(page, /"years"/);
        await expectLiveResult(page, /riskResult/);
    });

    test("renames an action column and migrates every rule's and the default row's then key", async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await renameHeader(page, 'risk', 'level', 'band');
        await expectLiveModel(page, /"band"/);
        await expectLiveResult(page, /riskResult/);
    });

    test("renames a relation column and migrates every record's cell key", async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await renameHeader(page, 'properties', 'reference', 'propertyId');
        await expectLiveModel(page, /propertyId/);
        await expectLiveResult(page, /propertyId/);
    });

    test('rejects a colliding column rename visibly and without partial changes', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        const before = await page.getByTestId('live-model').textContent();
        await renameHeader(page, 'properties', 'reference', 'value');
        await expect(page.getByText(/already exists/)).toBeVisible();
        await expectLiveModel(page, before ?? '');
    });

    test('changes an argument type across the supported type matrix', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add type');
        await chooseRowAction(page, '*', 'Add function');
        await chooseRowAction(page, 'function', 'Add argument');
        for (const type of ['number', 'string', 'boolean', 'date', 'Type', 'number[]', '<number, required: true>']) {
            await retypeHeader(page, 'function', 'arg', type);
        }
        await expectLiveModel(page, /"arg":\{"@kind":"type","type":"number","required":true\}/);
    });

    test("changes a condition column's type and keeps every rule cell valid", async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await retypeHeader(page, 'risk', 'age', 'number');
        await expectLiveResult(page, /riskResult/);
    });

    test('rejects a retype that invalidates existing cells atomically', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        const before = await page.getByTestId('live-model').textContent();
        await retypeHeader(page, 'risk', 'segment', 'number');
        await expect(page.getByTestId('row-error-risk')).toBeVisible();
        await expectLiveModel(page, before ?? '');
    });

    test('creates a numeric condition column and authors a range condition', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add decision table');
        await chooseRowAction(page, 'decisionTable', 'Add condition column');
        await retypeHeader(page, 'decisionTable', 'condition', 'number');
        await page.getByTestId('append-decisionTable').click();
        await valueCell(page, 'decisionTable.rules[0]').locator('span[tabindex="0"]').click();
        await replaceActiveExpression(page, '18..25');
        await page.keyboard.press('Enter');
        await expectLiveModel(page, /18\.\.25/);
    });

    test('creates a date condition column and authors a comparison condition', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add decision table');
        await chooseRowAction(page, 'decisionTable', 'Add condition column');
        await retypeHeader(page, 'decisionTable', 'condition', 'date');
        await page.getByTestId('append-decisionTable').click();
        await valueCell(page, 'decisionTable.rules[0]').locator('span[tabindex="0"]').click();
        await replaceActiveExpression(page, '>= @"2026-01-01"');
        await page.keyboard.press('Enter');
        await expectLiveModel(page, /2026-01-01/);
    });

    test("reorders ruleset columns and keeps every rule's cells aligned", async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await moveHeader(page, 'risk', 'segment', 'left');
        await expectHeaders(page, 'risk', ['segment', 'age', 'applied', 'level']);
        await expectLiveResult(page, /riskResult/);
    });

    test("reorders relation columns and keeps every record's cells aligned", async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await moveHeader(page, 'properties', 'value', 'left');
        await expectHeaders(page, 'properties', ['value', 'reference', 'address']);
        await expectLiveResult(page, /"value":320000.*"reference":"P-001"/);
    });

    test('reorders function arguments while preserving named-call execution', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await moveHeader(page, 'payment', 'term', 'left');
        await expectHeaders(page, 'payment', ['term', 'amount']);
        await expectLiveResult(page, /"result":100/);
    });

    test('offers no drag affordance where column reorder is unsupported', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await expect(page.getByLabel('Drag to reorder column')).toHaveCount(0);
        await expect(page.getByLabel('Move amount right')).toBeVisible();
    });
});
