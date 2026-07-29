import {expect, test, type Page} from '@playwright/test';
import {expectHeaders} from './columnHelpers';
import {
    chooseRowAction,
    commitExpression,
    dragRow,
    expectLiveModel,
    expectLiveResult,
    openBoxedEditorStory,
    replaceActiveExpression,
    valueCell,
} from './helpers';

async function editCell(page: Page, row: string, index: number, value: string): Promise<void> {
    await valueCell(page, row).locator('span[tabindex="0"]').nth(index).click();
    await replaceActiveExpression(page, value);
    await page.keyboard.press('Enter');
}

test.describe('Boxed Editor / decision tables', () => {
    test('creates a table with seeded hit policy and empty default', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add decision table');
        await expect(page.getByTestId('row-decisionTable.hitPolicy')).toContainText('first-match');
        await expect(page.getByTestId('row-decisionTable.default')).toBeVisible();
    });

    test('links immediately with zero rules', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add decision table');
        await expectLiveResult(page, '{}');
    });

    test('uses an expression cell for a rule added before columns exist', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add decision table');
        await page.getByTestId('append-decisionTable').click();
        await expect(valueCell(page, 'decisionTable.rules[0]')).toContainText('true');
    });

    test('adds condition columns cumulatively across every rule', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        for (const expected of [
            ['age', 'segment', 'applied', 'condition', 'level'],
            ['age', 'segment', 'applied', 'condition', 'condition2', 'level'],
        ]) {
            await chooseRowAction(page, 'risk', 'Add condition column');
            await expectHeaders(page, 'risk', expected);
            await expectLiveResult(page, /riskResult/);
        }
    });

    test('adds action columns cumulatively to rules and default', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        for (const name of ['action', 'action2']) {
            await chooseRowAction(page, 'risk', 'Add action column');
            await expect(valueCell(page, 'risk.default')).toContainText('');
            await expectLiveModel(page, new RegExp(`"${name}"`));
        }
    });

    test("does not add condition cells to the default row", async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        const before = await valueCell(page, 'risk.default').locator('span[tabindex="0"]').count();
        await chooseRowAction(page, 'risk', 'Add condition column');
        await expect(valueCell(page, 'risk.default').locator('span[tabindex="0"]')).toHaveCount(before);
    });

    test('deletes a condition column from every rule', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await chooseRowAction(page, 'risk', 'Delete "applied" column');
        await expectHeaders(page, 'risk', ['age', 'segment', 'level']);
        await expectLiveModel(page, /"age".*"segment"/);
    });

    test('deletes an action column from rules and default', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await chooseRowAction(page, 'risk', 'Delete "level" column');
        await expectHeaders(page, 'risk', ['age', 'segment', 'applied']);
        await expect(page.getByTestId('row-risk.default')).toBeVisible();
    });

    test('deletes the last condition column and remains linkable', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add decision table');
        await chooseRowAction(page, 'decisionTable', 'Add condition column');
        await chooseRowAction(page, 'decisionTable', 'Delete "condition" column');
        await expectLiveResult(page, '{}');
    });

    test('adds a rule with action cells seeded from existing output', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await page.getByTestId('append-risk').click();
        await expect(valueCell(page, 'risk.rules[2]')).toContainText("'high'");
        await expectLiveResult(page, /"riskResult"/);
    });

    test('duplicates a rule', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await chooseRowAction(page, 'risk.rules[0]', 'Duplicate');
        await expect(page.getByTestId('row-risk.rules[2]')).toBeVisible();
        await expectLiveResult(page, /riskResult/);
    });

    test('deletes a rule', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await chooseRowAction(page, 'risk.rules[0]', 'Delete');
        await expect(page.getByTestId('row-risk.rules[1]')).toHaveCount(0);
        await expectLiveResult(page, /riskResult/);
    });

    test('deletes the last rule and remains linkable', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await chooseRowAction(page, 'collectable.rules[1]', 'Delete');
        await chooseRowAction(page, 'collectable.rules[0]', 'Delete');
        await expectLiveResult(page, /"value":0/);
    });

    test('reorders rules and changes first-match evaluation order', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await expectLiveResult(page, /"value":1/);
        await dragRow(page, 'collectable.rules[1]', 'collectable.rules[0]');
        await expectLiveResult(page, /"value":2/);
    });

    test('omits a blank condition key as any', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await editCell(page, 'risk.rules[0]', 1, '');
        await expect(page.getByTestId('live-model')).not.toContainText('"segment":"\\"\\""');
    });

    test('treats an all-blank rule as matching everything', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await editCell(page, 'collectable.rules[0]', 0, '');
        await expectLiveResult(page, /"value":1/);
    });

    test('edits the pinned default action', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await editCell(page, 'risk.default', 0, '"fallback"');
        await commitExpression(page, 'riskResult', 'risk(age: 90, segment: "none", applied: @"2020-01-01")');
        await expectLiveResult(page, /"level":"fallback"/);
    });

    test('offers no Delete or Duplicate on default', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await expect(
            page.getByTestId('row-risk.default').getByRole('button', {name: 'Open row actions'}),
        ).toHaveCount(0);
    });

    test('executes an input hitting the first rule', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await commitExpression(page, 'riskResult', 'risk(age: 20, segment: "retail", applied: @"2025-01-01")');
        await expectLiveResult(page, /"level":"high"/);
    });

    test('executes an input hitting a later rule', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await expectLiveResult(page, /"level":"medium"/);
    });

    test('executes default when nothing matches', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await commitExpression(page, 'riskResult', 'risk(age: 90, segment: "none", applied: @"2020-01-01")');
        await expectLiveResult(page, /"level":"none"/);
    });

    test('executes numeric range conditions', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await commitExpression(page, 'riskResult', 'risk(age: 20, segment: "retail", applied: @"2025-01-01")');
        await expectLiveResult(page, /high/);
    });

    test('executes comparison and string-equality conditions', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await expectLiveResult(page, /medium/);
    });

    test('re-executes after deleting a middle rule', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await page.getByTestId('append-risk').click();
        await chooseRowAction(page, 'risk.rules[1]', 'Delete');
        await expectLiveResult(page, /riskResult/);
    });
});
