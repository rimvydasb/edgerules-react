import {test, expect, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';

// The loan repayment project of models/loan-repayment in the Shell stories, over the real `@edgerules/web` engine.
// The model's own behavior is covered by models/loan-repayment/__tests__; this checks that every part of it renders.

// The engine loads and xyflow measures every node before it shows: the first lookup waits longer.
const SLOW = {timeout: 15_000};

function explorer(page: Page) {
    return page.getByRole('navigation', {name: 'Project explorer'});
}

test('the Project Explorer lists every entity of the model', async ({page}) => {
    await openStory(page, 'shell-shell--loan-repayment');
    const nav = explorer(page);
    for (const entry of ['LoanRequest', 'Installment', 'samplePayment', 'mortgageBook', 'termComparisonBook']) {
        await expect(nav.getByText(entry, {exact: true}), entry).toBeVisible(SLOW);
    }
    for (const method of ['pricingTier()', 'loanRepayment()', 'monthlyPayment()', 'yearlySummary()']) {
        await expect(nav.getByText(method, {exact: true}).first(), method).toBeVisible();
    }
});

test('the decision table opened as the root keeps its header row and its columns', async ({page}) => {
    await openStory(page, 'shell-shell--loan-repayment-decision-table');
    await expect(page.getByTestId('row-pricingTier')).toBeVisible(SLOW);
    for (const column of ['creditScore', 'years', 'tier', 'premium', 'approved']) {
        await expect(page.getByTestId(`column-pricingTier-${column}`), column).toBeVisible();
    }
    // The default row spans the condition columns and lines up with the action columns.
    const tier = await page.getByTestId('column-pricingTier-tier').boundingBox();
    const declined = await page.getByTestId('row-pricingTier.default').getByText("'declined'").boundingBox();
    expect(Math.abs(declined!.x - tier!.x)).toBeLessThan(12);
});

test('mortgageBook charts the repayment plan and shows its outputs', async ({page}) => {
    await openStory(page, 'shell-shell--loan-repayment-mortgage-book');
    await expect(page.getByRole('img', {name: 'Remaining balance'})).toBeVisible(SLOW);
    await expect(page.getByRole('img', {name: 'Yearly interest and principal'})).toBeVisible();

    const payment = page.getByTestId('output-node-output');
    await expect(payment.getByTestId('output-value')).toHaveText('1354.35');
    // The title stays whole next to the long source path; the path is the part that is cut. Element pixels, not
    // screen pixels: the canvas zoom scales the bounding box.
    const title = payment.getByText('Monthly payment', {exact: true});
    await expect(title).toBeVisible();
    const {clientWidth, scrollWidth} = await title.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
    }));
    expect(clientWidth).toBeGreaterThan(0);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test('termComparisonBook charts the balance of both terms', async ({page}) => {
    await openStory(page, 'shell-shell--loan-repayment-term-comparison');
    await expect(page.getByRole('img', {name: 'Balance by year'})).toBeVisible(SLOW);
    await expect(page.getByTestId('output-node-output').getByTestId('output-value')).toHaveText('1423.43');
    await expect(page.getByTestId('output-node-output2').getByTestId('output-value')).toHaveText('966.28');
});

test('the service tests pass when run, and show no result before', async ({page}) => {
    await openStory(page, 'shell-shell--loan-repayment-service-tests');
    const summaries = page.getByTestId(/^assertion-summary-/);
    await expect(summaries).toHaveCount(5, SLOW);
    await expect(summaries.first()).toHaveText('');
    await expect(page.locator('[data-mismatch="true"]')).toHaveCount(0);

    // A narrow viewport scrolls the grid instead of squeezing the test-case columns.
    const header = page.getByTestId('case-header-loanRepayment-1');
    expect((await header.boundingBox())!.width).toBeGreaterThanOrEqual(159);

    await page.getByRole('button', {name: 'Run all'}).click();
    await expect(summaries.nth(0)).toHaveText('7/7 ✓');
    await expect(summaries.nth(4)).toHaveText('6/6 ✓');
    await expect(page.locator('[data-mismatch="true"]')).toHaveCount(0);
});
