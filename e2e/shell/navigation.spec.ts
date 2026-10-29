import {test, expect, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';

// The navigation of the Shell over the loan repayment project of models/loan-repayment: the order of the header cells,
// the kind icon, the model name crumb, the Project Explorer that follows the shown entity, and the column toggles of
// the Boxed view that each entity keeps.

// The engine loads and xyflow measures every node before it shows: the first lookup waits longer.
const SLOW = {timeout: 15_000};

function crumbs(page: Page) {
    return page.getByRole('navigation', {name: 'Model path'});
}

function explorer(page: Page) {
    return page.getByRole('navigation', {name: 'Project explorer'});
}

// The tree item of an explorer entry, by its kind and its model path.
function entry(page: Page, kind: string, path: string) {
    return explorer(page).locator(`[role="treeitem"][data-value="${kind}:${path}"]`);
}

// The label of a section header of the explorer: a click collapses or expands the section.
function section(page: Page, label: string) {
    return explorer(page).getByText(label, {exact: true});
}

async function expectView(page: Page, view: string) {
    await expect(page.getByRole('radio', {name: view})).toHaveAttribute('aria-checked', 'true');
}

test('the header shows the settings, then Flow, Boxed, Code and Tests, then the split screen toggle', async ({
    page,
}) => {
    await openStory(page, 'models-loan-repayment--overview');
    const views = page.getByRole('radiogroup', {name: 'View'}).getByRole('radio');
    await expect(views).toHaveText(['Flow', 'Boxed', 'Code', 'Tests'], SLOW);

    const settings = await page.getByRole('button', {name: 'Model settings'}).boundingBox();
    const flow = await views.first().boundingBox();
    const tests = await views.last().boundingBox();
    const split = await page.getByTestId('shell-split-toggle').boundingBox();
    expect(settings!.x).toBeLessThan(flow!.x);
    expect(tests!.x).toBeLessThan(split!.x);
});

test.describe('the kind icon', () => {
    test('opens the model and a workbook in the Flow view, and keeps the Project Explorer open', async ({page}) => {
        await openStory(page, 'models-loan-repayment--overview');
        await expectView(page, 'Boxed');
        await page.getByRole('button', {name: 'Open in the Flow view'}).click(SLOW);
        await expectView(page, 'Flow');
        await expect(page.getByTestId('shell-workbook-picker')).toBeVisible();
        await expect(explorer(page).getByRole('tree')).toBeVisible();

        await page.getByTestId('shell-workbook-mortgageBook').click();
        await page.getByRole('radio', {name: 'Boxed'}).click();
        await expect(page.getByTestId('row-mortgageBook')).toBeVisible();
        // Already in the Boxed view: the workbook has a Flow view, so the icon opens it.
        await page.getByRole('button', {name: 'Open in the Flow view'}).click();
        await expectView(page, 'Flow');
        await expect(page.locator('.react-flow__node[data-id="mortgageBook.yearly"]')).toBeVisible(SLOW);
    });

    test('opens a decision table, which has no Flow view, in the Boxed view', async ({page}) => {
        await openStory(page, 'models-loan-repayment--decision-table');
        await page.getByRole('radio', {name: 'Code'}).click(SLOW);
        await expect(page.locator('.cm-content')).toBeVisible();
        await page.getByRole('button', {name: 'Open in the Boxed view'}).click();
        await expectView(page, 'Boxed');
        await expect(page.getByTestId('row-pricingTier')).toBeVisible();
        await expect(crumbs(page)).toContainText('pricingTier(...)');
    });
});

test.describe('the model name', () => {
    test('opens the workbook picker of the model from an entity', async ({page}) => {
        await openStory(page, 'models-loan-repayment--decision-table');
        await expect(page.getByTestId('row-pricingTier')).toBeVisible(SLOW);
        await crumbs(page).getByRole('button', {name: 'Loan Repayment Planner'}).click();
        await expectView(page, 'Flow');
        await expect(page.getByTestId('shell-workbook-picker')).toBeVisible();
        await expect(crumbs(page)).toHaveText('Loan Repayment Planner');
    });

    test('opens the workbook picker of the model from a workbook canvas', async ({page}) => {
        await openStory(page, 'models-loan-repayment--mortgage-book');
        await expect(page.locator('.react-flow__node[data-id="mortgageBook.yearly"]')).toBeVisible(SLOW);
        await crumbs(page).getByRole('button', {name: 'Loan Repayment Planner'}).click();
        await expect(page.getByTestId('shell-workbook-picker')).toBeVisible();
    });

    test('is a button at the model root too, and opens the workbook picker from any view', async ({page}) => {
        await openStory(page, 'models-loan-repayment--overview');
        const model = crumbs(page).getByRole('button', {name: 'Loan Repayment Planner'});
        await expect(model).toHaveAttribute('aria-current', 'page', SLOW);
        await model.click();
        await expect(page.getByTestId('shell-workbook-picker')).toBeVisible();

        await page.getByRole('radio', {name: 'Code'}).click();
        await model.click();
        await expectView(page, 'Flow');
        await expect(page.getByTestId('shell-workbook-picker')).toBeVisible();
        // In the Flow view of the model already, it stays there.
        await model.click();
        await expect(page.getByTestId('shell-workbook-picker')).toBeVisible();
    });
});

test.describe('the Project Explorer follows the shown entity', () => {
    test('a service and a method opened from their Flow nodes expand their collapsed section and are selected', async ({
        page,
    }) => {
        await openStory(page, 'models-loan-repayment--mortgage-book');
        await expect(page.locator('.react-flow__node[data-id="mortgageBook.yearly"]')).toBeVisible(SLOW);
        // The workbook is the shown entity.
        await expect(entry(page, 'workbook', 'mortgageBook')).toHaveAttribute('aria-selected', 'true');

        await section(page, 'Service Methods').click();
        await section(page, 'Methods').click();
        await expect(entry(page, 'service', 'loanRepayment')).toBeHidden();
        await expect(entry(page, 'function', 'yearlySummary')).toBeHidden();

        await page.getByRole('button', {name: 'Open loanRepayment in boxed editor'}).click();
        await expectView(page, 'Boxed');
        await expect(crumbs(page)).toContainText('loanRepayment(...)');
        await expect(entry(page, 'service', 'loanRepayment')).toBeVisible();
        await expect(entry(page, 'service', 'loanRepayment')).toHaveAttribute('aria-selected', 'true');
        await expect(entry(page, 'workbook', 'mortgageBook')).toHaveAttribute('aria-selected', 'false');

        await openStory(page, 'models-loan-repayment--mortgage-book');
        await expect(page.locator('.react-flow__node[data-id="mortgageBook.yearly"]')).toBeVisible(SLOW);
        await section(page, 'Methods').click();
        await expect(entry(page, 'function', 'yearlySummary')).toBeHidden();
        await page.getByRole('button', {name: 'Open yearlySummary in boxed editor'}).click();
        await expect(crumbs(page)).toContainText('yearlySummary(...)');
        await expect(entry(page, 'function', 'yearlySummary')).toBeVisible();
        await expect(entry(page, 'function', 'yearlySummary')).toHaveAttribute('aria-selected', 'true');
    });

    test('a service opened from the workbook picker is selected in Service Methods', async ({page}) => {
        await openStory(page, 'models-loan-repayment--overview');
        await section(page, 'Service Methods').click(SLOW);
        await crumbs(page).getByRole('button', {name: 'Loan Repayment Planner'}).click();
        await page.getByTestId('shell-service-loanRepayment').click();
        await expectView(page, 'Boxed');
        await expect(entry(page, 'service', 'loanRepayment')).toBeVisible();
        await expect(entry(page, 'service', 'loanRepayment')).toHaveAttribute('aria-selected', 'true');
    });

    test('a node centered from the explorer and the tests of a subject are selected', async ({page}) => {
        await openStory(page, 'models-loan-repayment--service-tests');
        await expect(entry(page, 'test', 'loanRepayment')).toHaveAttribute('aria-selected', 'true', SLOW);
        await expect(entry(page, 'service', 'loanRepayment')).toHaveAttribute('aria-selected', 'false');

        // The Boxed view of the same subject selects its method entry.
        await page.getByRole('radio', {name: 'Boxed'}).click();
        await expect(entry(page, 'service', 'loanRepayment')).toHaveAttribute('aria-selected', 'true');
        await expect(entry(page, 'test', 'loanRepayment')).toHaveAttribute('aria-selected', 'false');
    });

    test('a type opened from the explorer stays selected while its section collapses and opens again', async ({
        page,
    }) => {
        await openStory(page, 'models-loan-repayment--overview');
        await entry(page, 'type', 'LoanRequest').click(SLOW);
        await expect(crumbs(page)).toContainText('LoanRequest');
        await expect(entry(page, 'type', 'LoanRequest')).toHaveAttribute('aria-selected', 'true');
        // Another view of the same entity keeps the section the user collapsed, and the selection.
        await section(page, 'Types').click();
        await expect(entry(page, 'type', 'LoanRequest')).toBeHidden();
        await page.getByRole('radio', {name: 'Code'}).click();
        await page.getByRole('button', {name: 'Open in the Boxed view'}).click();
        await expect(entry(page, 'type', 'LoanRequest')).toBeHidden();
        await section(page, 'Types').click();
        await expect(entry(page, 'type', 'LoanRequest')).toHaveAttribute('aria-selected', 'true');
    });
});

test.describe('the column toggles of the Boxed view', () => {
    test('each entity keeps its own description and test column toggles', async ({page}) => {
        await openStory(page, 'models-loan-repayment--overview');
        const header = page.getByTestId('row-*');
        await header.getByRole('button', {name: 'Hide description'}).click(SLOW);
        await expect(page.getByRole('button', {name: 'Show description'})).toBeVisible();

        // Another entity starts with the defaults.
        await entry(page, 'ruleset', 'pricingTier').click();
        await expect(page.getByTestId('row-pricingTier')).toBeVisible();
        await expect(page.getByRole('button', {name: 'Hide description'})).toBeVisible();
        await page.getByRole('button', {name: 'Show test column'}).click();
        await expect(page.getByRole('button', {name: 'Hide test column'})).toBeVisible();

        // The model root keeps its hidden description, also after the Flow view.
        await crumbs(page).getByRole('button', {name: 'Loan Repayment Planner'}).click();
        await page.getByRole('radio', {name: 'Boxed'}).click();
        await expect(page.getByTestId('row-*').getByRole('button', {name: 'Show description'})).toBeVisible();
        await expect(page.getByRole('button', {name: 'Show test column'})).toBeVisible();

        // The decision table keeps its test column.
        await entry(page, 'ruleset', 'pricingTier').click();
        await expect(page.getByRole('button', {name: 'Hide description'})).toBeVisible();
        await expect(page.getByRole('button', {name: 'Hide test column'})).toBeVisible();
        await expect(page.getByTestId('row-pricingTier').locator('[data-column="test-results"]')).toBeVisible();
    });

    test('the split screen shows the selected node without its description and tests', async ({page}) => {
        await openStory(page, 'models-loan-repayment--mortgage-book');
        const yearly = page.locator('.react-flow__node[data-id="mortgageBook.yearly"]');
        await expect(yearly).toBeVisible(SLOW);
        await page.getByRole('button', {name: 'Split screen'}).click();
        await yearly.click({position: {x: 30, y: 10}});
        const panel = page.getByTestId('shell-split-panel');
        await expect(panel.getByTestId('row-yearlySummary.result')).toBeVisible();
        await expect(panel.getByRole('button', {name: 'Show description'})).toBeVisible();
        await expect(panel.locator('[data-column="description"]')).toHaveCount(0);
        await expect(panel.locator('[data-column="test-results"]')).toHaveCount(0);
    });
});

test('the settings dialog is a sharp sheet of glass that blurs the page behind it', async ({page}) => {
    await openStory(page, 'models-loan-repayment--overview');
    await page.getByRole('button', {name: 'Model settings'}).click(SLOW);
    const dialog = page.getByRole('dialog', {name: 'Model settings'});
    await expect(dialog.getByRole('textbox', {name: 'Name'})).toHaveValue('Loan Repayment Planner');
    const style = await dialog.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
            radius: computed.borderTopLeftRadius,
            blur: computed.backdropFilter || computed.getPropertyValue('-webkit-backdrop-filter'),
            background: computed.backgroundColor,
        };
    });
    expect(style.radius).toBe('0px');
    expect(style.blur).toContain('blur(');
    // A translucent fill: the page shows through.
    expect(style.background).toMatch(/rgba?\(.*,\s*0?\.\d+\)|color\(.*\/\s*0?\.\d+\)|oklab\(.*\/\s*0?\.\d+\)/);
    for (const button of ['Cancel', 'Save']) {
        const radius = await dialog
            .getByRole('button', {name: button})
            .evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
        expect(radius, button).toBe('0px');
    }
    await dialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(dialog).toHaveCount(0);
});
