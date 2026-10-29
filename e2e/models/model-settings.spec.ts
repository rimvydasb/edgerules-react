import {test, expect, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';

// The settings of the Shell header over the loan repayment project of models/loan-repayment: the gear left of the view
// switch renames the model or an annotated entity, sets the model version and edits the descriptions. The Flow view
// of the model root shows the workbook names and descriptions.

// The engine loads before the Shell shows: the first lookup waits longer.
const SLOW = {timeout: 15_000};

function crumbs(page: Page) {
    return page.getByRole('navigation', {name: 'Model path'});
}

async function fill(page: Page, values: Record<string, string>) {
    const dialog = page.getByRole('dialog');
    for (const [label, value] of Object.entries(values)) {
        await dialog.getByRole('textbox', {name: label}).fill(value);
    }
    await dialog.getByRole('button', {name: 'Save'}).click();
    await expect(dialog).toHaveCount(0);
}

test('the model shows its name; the model settings rename it and set its version and description', async ({page}) => {
    await openStory(page, 'models-loan-repayment--overview');
    await expect(crumbs(page)).toHaveText('Loan Repayment Planner', SLOW);
    await expect(page.getByTestId('row-*').getByRole('heading')).toHaveText('Loan Repayment Planner');
    // The Boxed Editor has no settings of its own: the Shell header has them.
    await expect(page.getByTestId('row-*').getByRole('button', {name: 'Model settings'})).toHaveCount(0);

    await page.getByRole('button', {name: 'Model settings'}).click();
    const dialog = page.getByRole('dialog', {name: 'Model settings'});
    await expect(dialog.getByRole('textbox', {name: 'Name'})).toHaveValue('Loan Repayment Planner');
    await expect(dialog.getByRole('textbox', {name: 'Version'})).toHaveValue('1.2.0');
    await expect(dialog.getByRole('textbox', {name: 'Description'})).toHaveValue(/^Prices consumer loans/);
    await fill(page, {Name: 'Retail Lending', Version: '1.3.0', Description: 'Prices retail loans'});

    await expect(crumbs(page)).toHaveText('Retail Lending');
    await expect(page.getByTestId('row-*').getByRole('heading')).toHaveText('Retail Lending');
    // The model description is the description of the model row.
    await expect(page.getByRole('textbox', {name: 'description *'})).toHaveValue('Prices retail loans');

    await page.getByRole('button', {name: 'Model settings'}).click();
    await expect(dialog.getByRole('textbox', {name: 'Version'})).toHaveValue('1.3.0');
    await dialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(dialog).toHaveCount(0);
});

test('the Flow view of the model shows a panel per workbook with its name and description', async ({page}) => {
    await openStory(page, 'models-loan-repayment--overview');
    await page.getByRole('radio', {name: 'Flow'}).click(SLOW);
    const picker = page.getByTestId('shell-workbook-picker');
    const mortgage = picker.getByTestId('shell-workbook-mortgageBook');
    const terms = picker.getByTestId('shell-workbook-termComparisonBook');
    await expect(mortgage).toHaveAccessibleName('Mortgage plan');
    await expect(mortgage).toContainText('mortgageBook');
    await expect(mortgage).toContainText('A 250 000 mortgage over 25 years');
    await expect(mortgage).toContainText('1 input · 2 functions');
    await expect(terms).toHaveAccessibleName('15 vs 30 years');
    await expect(terms).toContainText('The same 180 000 loan over 15 and over 30 years');
    await expect(terms).toContainText('2 inputs · 3 functions');

    await mortgage.click();
    await expect(crumbs(page)).toContainText('mortgageBook');
    await expect(page.locator('.react-flow__node[data-id="mortgageBook.yearly"]')).toBeVisible(SLOW);
});

test('the workbook settings rename the @Workbook annotation and edit the workbook description', async ({page}) => {
    await openStory(page, 'models-loan-repayment--mortgage-book');
    await page.getByRole('button', {name: 'Workbook settings'}).click(SLOW);
    const dialog = page.getByRole('dialog', {name: 'Workbook settings'});
    await expect(dialog.getByRole('textbox', {name: 'Name'})).toHaveValue('Mortgage plan');
    await expect(dialog.getByRole('textbox', {name: 'Version'})).toHaveCount(0);
    await fill(page, {Name: 'Family home', Description: 'The mortgage of a family home'});

    // The field keeps its name; the annotation gets the new one.
    await page.getByRole('radio', {name: 'Code'}).click();
    await crumbs(page).getByRole('button', {name: 'Loan Repayment Planner'}).click();
    // The workbooks are at the end of the model; CodeMirror renders the lines in view only.
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+End`);
    await expect(page.locator('.cm-content')).toContainText('@Workbook(name: "Family home")');
    await expect(page.locator('.cm-content')).toContainText('mortgageBook: {');

    await page.getByRole('radio', {name: 'Flow'}).click();
    const mortgage = page.getByTestId('shell-workbook-mortgageBook');
    await expect(mortgage).toHaveAccessibleName('Family home');
    await expect(mortgage).toContainText('The mortgage of a family home');
});

test('a decision table has no settings; a workbook and the model have', async ({page}) => {
    await openStory(page, 'models-loan-repayment--decision-table');
    await expect(page.getByTestId('row-pricingTier')).toBeVisible(SLOW);
    await expect(page.getByTestId('shell-settings')).toHaveCount(0);

    await openStory(page, 'models-loan-repayment--mortgage-book');
    await page.getByRole('button', {name: 'Workbook settings'}).click(SLOW);
    await page.getByRole('dialog').getByRole('button', {name: 'Cancel'}).click();
    await crumbs(page).getByRole('button', {name: 'Loan Repayment Planner'}).click();
    await expect(page.getByRole('button', {name: 'Model settings'})).toBeVisible();
});
