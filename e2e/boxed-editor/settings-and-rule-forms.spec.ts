import {expect, test, type Page} from '@playwright/test';
import {
    chooseRowAction,
    expectLiveModel,
    expectLiveResult,
    openBoxedEditorStory,
    replaceActiveExpression,
    valueCell,
} from './helpers';

async function pick(page: Page, label: string, option: string): Promise<void> {
    await page.getByLabel(label).click();
    await page.getByRole('menuitem', {name: option, exact: true}).click();
}

async function editLastCell(page: Page, rowPath: string, value: string): Promise<void> {
    await valueCell(page, rowPath).locator('span[tabindex="0"]').last().click();
    await replaceActiveExpression(page, value);
    await page.keyboard.press('Enter');
}

test.describe('Boxed Editor / settings and rule forms', () => {
    test('switches hit policy from first-match to best-match through the chip', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await pick(page, 'Change hit policy', 'best-match');
        await expectLiveModel(page, /"@hitPolicy":"best-match"/);
        await expectLiveResult(page, /"value":2/);
    });

    test('shows priority under best-match and hides it again on switching back', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await pick(page, 'Change hit policy', 'best-match');
        await expect(valueCell(page, 'collectable.rules[0]')).toContainText('1');
        await pick(page, 'Change hit policy', 'first-match');
        await expectLiveModel(page, /"@hitPolicy":"first-match"/);
        await expect(page.getByTestId('live-model')).not.toContainText('"priority"');
    });

    test('requires a priority on every rule under best-match', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await pick(page, 'Change hit policy', 'best-match');
        await expectLiveModel(page, /"priority":1.*"priority":2/);
    });

    test('rejects a non-numeric priority with a visible error', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await pick(page, 'Change hit policy', 'best-match');
        await editLastCell(page, 'collectable.rules[0]', 'not-a-number');
        await expect(page.getByText('Priority must be a whole number')).toBeVisible();
    });

    test('switches to unique-match and executes a table with one match', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await page.getByTestId('row-risk.hitPolicy').getByLabel('Change hit policy').click();
        await page.getByRole('menuitem', {name: 'unique-match'}).click();
        await expectLiveResult(page, /"riskResult"/);
    });

    test('switches to collect-matches, drops default atomically, and collects matches', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await pick(page, 'Change hit policy', 'collect-matches');
        await expect(page.getByTestId('row-collectable.default')).toHaveCount(0);
        await expectLiveModel(page, /"@hitPolicy":"collect-matches"/);
        await expectLiveResult(page, /"value":1.*"value":2/);
    });

    test('restores the default when switching away from collect-matches', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await pick(page, 'Change hit policy', 'collect-matches');
        await pick(page, 'Change hit policy', 'first-match');
        await expect(page.getByTestId('row-collectable.default')).toBeVisible();
        await expectLiveResult(page, /"value":1/);
    });

    test('operates the hit-policy chip by keyboard alone', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await page.getByLabel('Change hit policy').focus();
        await page.keyboard.press('ArrowDown');
        await page.getByRole('menuitem', {name: 'unique-match'}).focus();
        await page.keyboard.press('Enter');
        await expectLiveModel(page, /"@hitPolicy":"unique-match"/);
    });

    test('selects the supported solver backend through the using chip', async ({page}) => {
        await openBoxedEditorStory(page, 'optimisation-settings-playground');
        await pick(page, 'Change using', 'highs');
        await expectLiveResult(page, /"chairs":8/);
    });

    test('adds and edits a timeLimit setting', async ({page}) => {
        await openBoxedEditorStory(page, 'optimisation-settings-playground');
        await chooseRowAction(page, 'factory', 'Add time limit');
        await valueCell(page, 'factory.timeLimit').locator('span[tabindex="0"]').click();
        await replaceActiveExpression(page, '2500');
        await page.keyboard.press('Enter');
        await expectLiveModel(page, /"@timeLimit":2500/);
    });

    test('adds a bottlenecks setting and toggles it', async ({page}) => {
        await openBoxedEditorStory(page, 'optimisation-settings-playground');
        await chooseRowAction(page, 'factory', 'Add bottlenecks');
        await pick(page, 'Change bottlenecks', 'false');
        await expectLiveResult(page, /"chairs":8/);
    });

    test('executes optimisation after each setting change', async ({page}) => {
        await openBoxedEditorStory(page, 'optimisation-settings-playground');
        await chooseRowAction(page, 'factory', 'Add time limit');
        await expectLiveResult(page, /"chairs":8/);
        await chooseRowAction(page, 'factory', 'Add bottlenecks');
        await expectLiveResult(page, /"chairs":8/);
    });

    test('switches a rule from cell-map conditions to expression and back', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await chooseRowAction(page, 'collectable.rules[0]', 'Switch to expression condition');
        await expectLiveModel(page, /"when":true/);
        await chooseRowAction(page, 'collectable.rules[0]', 'Switch to column conditions');
        await expect(page.getByTestId('live-model')).not.toContainText('"when":true');
    });

    test('warns before discarding an authored expression', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        page.once('dialog', async (dialog) => {
            expect(dialog.message()).toContain('Discard');
            await dialog.dismiss();
        });
        await chooseRowAction(page, 'risk.rules[1]', 'Switch to column conditions');
        await expectLiveModel(page, /age >= 26/);
    });

    test('authors cell-map and expression rules in one table and executes both', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await chooseRowAction(page, 'collectable.rules[1]', 'Switch to expression condition');
        await editLastCell(page, 'collectable.rules[1]', 'x <= 10');
        await expectLiveResult(page, /"value":1/);
    });

    test('uses expression form when a rule has no condition columns', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add decision table');
        await page.getByTestId('append-decisionTable').click();
        await expect(valueCell(page, 'decisionTable.rules[0]')).toContainText('true');
        await expectLiveModel(page, /"when":true/);
    });
});
