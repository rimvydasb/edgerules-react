import {test, expect, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';

// The loan repayment project of models/loan-repayment in its Models stories (stories/models), over the real `@edgerules/web` engine.
// The model's own behavior is covered by models/loan-repayment/__tests__; this checks that every part of it renders.

// The engine loads and xyflow measures every node before it shows: the first lookup waits longer.
const SLOW = {timeout: 15_000};

function explorer(page: Page) {
    return page.getByRole('navigation', {name: 'Project explorer'});
}

test('the Project Explorer lists every entity of the model', async ({page}) => {
    await openStory(page, 'models-loan-repayment--overview');
    const nav = explorer(page);
    for (const entry of ['LoanRequest', 'Installment', 'samplePayment', 'mortgageBook', 'termComparisonBook']) {
        await expect(nav.getByText(entry, {exact: true}), entry).toBeVisible(SLOW);
    }
    for (const method of ['pricingTier(...)', 'loanRepayment(...)', 'monthlyPayment(...)', 'yearlySummary(...)']) {
        await expect(nav.getByText(method, {exact: true}).first(), method).toBeVisible();
    }
});

test('the decision table opened as the root keeps its header row and its columns', async ({page}) => {
    await openStory(page, 'models-loan-repayment--decision-table');
    await expect(page.getByTestId('row-pricingTier')).toBeVisible(SLOW);
    for (const column of ['creditScore', 'years', 'tier', 'premium', 'approved']) {
        await expect(page.getByTestId(`column-pricingTier-${column}`), column).toBeVisible();
    }
    // The default row spans the condition columns and lines up with the action columns.
    const tier = await page.getByTestId('column-pricingTier-tier').boundingBox();
    const declined = await page.getByTestId('row-pricingTier.default').getByText("'declined'").boundingBox();
    expect(Math.abs(declined!.x - tier!.x)).toBeLessThan(12);
});

test('the decision table runs its own tests when its test column is shown', async ({page}) => {
    await openStory(page, 'models-loan-repayment--decision-table');
    await expect(page.getByTestId('header-row').getByRole('heading')).toHaveText('Decision table', SLOW);
    await page.getByRole('button', {name: 'Show test column'}).click();
    // The tests of `pricingTier` itself, not of the whole model: its own row shows the whole result.
    const result = page.getByTestId('row-pricingTier').locator('[data-column="test-results"]');
    await expect(result).toHaveText('{…}', SLOW);
    await page.getByRole('button', {name: 'Next test case'}).click();
    await expect(page.getByTestId('header-row')).toContainText(/2\/\d+/);
    await expect(result).toHaveText('{…}');
});

test('mortgageBook charts the repayment plan and shows its outputs', async ({page}) => {
    await openStory(page, 'models-loan-repayment--mortgage-book');
    await expect(page.getByRole('img', {name: 'Remaining balance'})).toBeVisible(SLOW);
    await expect(page.getByRole('img', {name: 'Yearly interest and principal'})).toBeVisible();

    const payment = page.getByTestId('output-node-output');
    await expect(payment.getByTestId('output-value')).toHaveText('1354.35');
    // The cost record and the repayment schedule show as tables.
    await expect(page.getByTestId('output-node-output2').getByTestId('output-value')).toHaveText('2 fields');
    const schedule = page.getByTestId('output-node-output3');
    await expect(schedule.getByTestId('output-value')).toHaveText('300 rows × 5 columns');
    await expect(schedule.getByTestId('output-table').getByRole('columnheader')).toHaveText([
        '#',
        'period',
        'payment',
        'interest',
        'principal',
        'balance',
    ]);
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
    await openStory(page, 'models-loan-repayment--term-comparison-book');
    await expect(page.getByRole('img', {name: 'Balance by year'})).toBeVisible(SLOW);
    await expect(page.getByTestId('output-node-output').getByTestId('output-value')).toHaveText('1423.43');
    await expect(page.getByTestId('output-node-output2').getByTestId('output-value')).toHaveText('966.28');
});

test('the service tests pass when run, and show no result before', async ({page}) => {
    await openStory(page, 'models-loan-repayment--service-tests');
    const summaries = page.getByTestId(/^assertion-summary-/);
    await expect(summaries).toHaveCount(5, SLOW);
    await expect(summaries.first()).toHaveText('');
    await expect(page.locator('[data-mismatch="true"]')).toHaveCount(0);

    // A narrow viewport scrolls the grid instead of squeezing the test-case columns.
    const header = page.getByTestId('case-header-loanRepayment-1');
    expect((await header.boundingBox())!.width).toBeGreaterThanOrEqual(159);

    await page.getByRole('button', {name: 'Run all'}).click();
    await expect(summaries.nth(0)).toHaveText('7/7');
    await expect(summaries.nth(4)).toHaveText('6/6');
    await expect(page.locator('[data-mismatch="true"]')).toHaveCount(0);
});

test('a change in the split screen Boxed Editor shows on the canvas and recalculates the outputs', async ({page}) => {
    await openStory(page, 'models-loan-repayment--mortgage-book');
    const yearly = page.locator('.react-flow__node[data-id="mortgageBook.yearly"]');
    await expect(yearly).toBeVisible(SLOW);
    await page.getByRole('button', {name: 'Split screen'}).click();
    const panel = page.getByTestId('shell-split-panel');

    // The chart is wired to the unnamed return of `yearlySummary`: the whole list of the node.
    const chart = page.locator('.react-flow__node[data-id="chart2"]');
    await expect(chart.getByRole('img', {name: 'Yearly interest and principal'})).toBeVisible();
    await expect(chart).toContainText('mortgageBook.yearly');

    // The selected function node shows the body of `yearlySummary`; a new field of it is a new result of the node.
    await yearly.click({position: {x: 30, y: 10}});
    await expect(panel.getByTestId('row-yearlySummary.result')).toBeVisible();
    await expect(yearly.locator('[data-handleid="out:field"]')).toHaveCount(0);
    await panel.getByText('(new item)').click();
    await expect(panel.getByTestId('row-yearlySummary.field')).toBeVisible();
    await expect(yearly.locator('[data-handleid="out:field"]')).toHaveCount(1);

    // The body is a record now: the wire on the `result` pin reads the field `result`, the same list, not the record.
    await expect(chart).toContainText('mortgageBook.yearly.result');
    await expect(chart.getByRole('img', {name: 'Yearly interest and principal'})).toBeVisible();
    await expect(page.getByTestId('rf__edge-chart2:data')).toHaveCount(1);

    // An expression changed in the panel recalculates the output nodes that read it.
    const payment = page.getByTestId('output-node-output').getByTestId('output-value');
    await expect(payment).toHaveText('1354.35');
    await page.locator('.react-flow__node[data-id="mortgageBook.repayment"]').click({position: {x: 30, y: 10}});
    await panel.getByTestId('row-loanRepayment.payment').locator('[data-column="value"]').click();
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
    await page.keyboard.insertText('1000');
    await page.keyboard.press('Enter');
    await expect(payment).toHaveText('1000');
});

test('the service flow shows the request parameter, the body invocations and the Repayment result', async ({page}) => {
    await openStory(page, 'models-loan-repayment--service-flow');
    const request = page.getByTestId('parameter-node-loanRepayment.request');
    await expect(request).toBeVisible(SLOW);
    await expect(request).toContainText('LoanRequest');
    for (const field of ['amount', 'years', 'creditScore']) await expect(request).toContainText(field);
    for (const node of ['pricing', 'rate', 'annuity', 'fullSchedule', 'cost']) {
        await expect(page.getByTestId(`function-node-loanRepayment.${node}`), node).toBeVisible();
    }
    const result = page.getByTestId('result-node-loanRepayment.return');
    await expect(result).toContainText('Repayment');
    await expect(result).toContainText('{ pricing, rate, payment, schedule, cost }');
    // The parameter feeds the price tier, and the price tier feeds the result.
    await expect(page.locator('.react-flow__edge[data-id="loanRepayment.pricing:creditScore"]')).toHaveCount(1);
    await expect(page.locator('.react-flow__edge[data-id="loanRepayment.return:pricing"]')).toHaveCount(1);
});
