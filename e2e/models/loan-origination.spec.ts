import {test, expect, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';

// The loan origination project of models/loan-origination in the Shell stories, over the real `@edgerules/web` engine.
// The model's own behavior is covered by models/loan-origination/__tests__; this checks that every part of it renders.

// The engine loads and xyflow measures every node before it shows: the first lookup waits longer.
const SLOW = {timeout: 15_000};

function explorer(page: Page) {
    return page.getByRole('navigation', {name: 'Project explorer'});
}

test('the Project Explorer lists every entity of the model', async ({page}) => {
    await openStory(page, 'shell-shell--loan-origination');
    const nav = explorer(page);
    for (const entry of [
        'Applicant',
        'Application',
        'LoanTerms',
        'sampleDecision',
        'originationBook',
        'capacityBook',
    ]) {
        await expect(nav.getByText(entry, {exact: true}), entry).toBeVisible(SLOW);
    }
    for (const method of ['applicantScorecard()', 'decisionMatrix()', 'originate()', 'policyRules()']) {
        await expect(nav.getByText(method, {exact: true}).first(), method).toBeVisible();
    }
});

test('the scorecard decision table shows a column per characteristic', async ({page}) => {
    await openStory(page, 'shell-shell--loan-origination-scorecard');
    await expect(page.getByTestId('row-applicantScorecard')).toBeVisible(SLOW);
    for (const column of ['age', 'employment', 'yearsEmployed', 'bureauScore', 'delinquencies', 'points']) {
        await expect(page.getByTestId(`column-applicantScorecard-${column}`), column).toBeVisible();
    }
});

test('originationBook charts both scorecards and shows the decision', async ({page}) => {
    await openStory(page, 'shell-shell--loan-origination-book');
    await expect(page.getByRole('img', {name: 'Main applicant scorecard'})).toBeVisible(SLOW);
    await expect(page.getByRole('img', {name: 'Co-applicant scorecard'})).toBeVisible();

    const decision = page.getByTestId('output-node-output');
    await expect(decision.getByTestId('output-value')).toHaveText('2 fields');
    await expect(decision.getByTestId('output-table')).toContainText('APPROVE');
    await expect(page.getByTestId('output-node-output2').getByTestId('output-table')).toContainText('1473.81');
});

test('capacityBook charts the largest affordable loan by term', async ({page}) => {
    await openStory(page, 'shell-shell--loan-origination-capacity');
    await expect(page.getByRole('img', {name: 'Largest affordable loan'})).toBeVisible(SLOW);
    await expect(page.getByTestId('output-node-output').getByTestId('output-value')).toHaveText('5 rows × 3 columns');
});

test('the service tests of joint and single applications pass when run', async ({page}) => {
    await openStory(page, 'shell-shell--loan-origination-service-tests');
    const summaries = page.getByTestId(/^assertion-summary-/);
    await expect(summaries).toHaveCount(6, SLOW);
    await expect(summaries.first()).toHaveText('');

    await page.getByRole('button', {name: 'Run all'}).click();
    for (let index = 0; index < 6; index++) await expect(summaries.nth(index)).toHaveText('11/11');
    await expect(page.locator('[data-mismatch="true"]')).toHaveCount(0);
});
