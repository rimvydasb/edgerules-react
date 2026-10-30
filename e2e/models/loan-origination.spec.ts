import {test, expect, type Page} from '@playwright/test';
import {openStory} from '../support/storybook';
import {chooseRowAction, valueCell} from '../boxed-editor/helpers';
import {expectHeaders, renameHeader, retypeHeader} from '../boxed-editor/columnHelpers';

// The loan origination project of models/loan-origination in its Models stories (stories/models), over the real `@edgerules/web` engine.
// The model's own behavior is covered by models/loan-origination/__tests__; this checks that every part of it renders.

// The engine loads and xyflow measures every node before it shows: the first lookup waits longer.
const SLOW = {timeout: 15_000};

function explorer(page: Page) {
    return page.getByRole('navigation', {name: 'Project explorer'});
}

test('the Project Explorer lists every entity of the model', async ({page}) => {
    await openStory(page, 'models-loan-origination--overview');
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
    for (const method of [
        'applicantScorecard(...)',
        'decisionMatrix(...)',
        'loanOriginationDecision(...)',
        'policyRules(...)',
    ]) {
        await expect(nav.getByText(method, {exact: true}).first(), method).toBeVisible();
    }
});

test('the Project Explorer labels a method with arguments as name(...) and one without as name()', async ({page}) => {
    await openStory(page, 'models-loan-origination--overview');
    const nav = explorer(page);
    // `.first()`: the method; `applicantRecord(...)` is listed again under Tests.
    await expect(nav.getByText('applicantRecord(...)', {exact: true}).first()).toBeVisible(SLOW);
    await expect(nav.getByText('creditPolicy()', {exact: true})).toBeVisible();
    await expect(nav.getByText('applicantRecord()', {exact: true})).toHaveCount(0);
});

test.describe('a function opened from the Project Explorer', () => {
    test.beforeEach(async ({page}) => {
        await openStory(page, 'models-loan-origination--origination-book');
        await explorer(page).getByText('applicantRecord(...)', {exact: true}).first().click(SLOW);
        await expect(page.getByRole('navigation', {name: 'Model path'})).toContainText('applicantRecord(...)');
        // The Flow view of the book shows the nodes of the function body; its arguments are edited in the Boxed view.
        await page.getByRole('radio', {name: 'Boxed'}).click();
    });

    test('shows its arguments above its body', async ({page}) => {
        await expect(page.getByTestId('row-applicantRecord')).toBeVisible();
        await expectHeaders(page, 'applicantRecord', ['applicant', 'applicationDate']);
        for (const field of ['data', 'age', 'disposableIncome']) {
            await expect(page.getByTestId(`row-applicantRecord.${field}`), field).toBeVisible();
        }
    });

    test('renames an argument and migrates its references in the body', async ({page}) => {
        await renameHeader(page, 'applicantRecord', 'applicationDate', 'asOf');
        await expectHeaders(page, 'applicantRecord', ['applicant', 'asOf']);
        await expect(valueCell(page, 'applicantRecord.age')).toContainText('asOf');
    });

    // `applicationRecord` calls `applicantRecord(applicant, applicationDate)` and `calendarDiff` reads a date: the engine
    // rejects an edit that breaks either, and the editor shows why.
    test('rejects a retype that breaks the body visibly', async ({page}) => {
        await retypeHeader(page, 'applicantRecord', 'applicationDate', 'string');
        await expect(page.getByLabel('Change type of applicationDate')).toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByTestId('row-applicantRecord').getByRole('alert')).toContainText('type mismatch');
    });

    test('rejects an argument its callers do not supply visibly', async ({page}) => {
        await chooseRowAction(page, 'applicantRecord', 'Add argument');
        await expect(page.getByTestId('row-applicantRecord').getByRole('alert')).toContainText(
            "function 'applicantRecord' expects 3 argument(s) but 2 argument(s) were supplied",
        );
        await expectHeaders(page, 'applicantRecord', ['applicant', 'applicationDate']);
    });
});

test('the scorecard decision table shows a column per characteristic', async ({page}) => {
    await openStory(page, 'models-loan-origination--scorecard');
    await expect(page.getByTestId('row-applicantScorecard')).toBeVisible(SLOW);
    for (const column of ['age', 'employment', 'yearsEmployed', 'bureauScore', 'delinquencies', 'points']) {
        await expect(page.getByTestId(`column-applicantScorecard-${column}`), column).toBeVisible();
    }
});

test('originationBook charts both scorecards and shows the decision', async ({page}) => {
    await openStory(page, 'models-loan-origination--origination-book');
    await expect(page.getByRole('img', {name: 'Main applicant scorecard'})).toBeVisible(SLOW);
    await expect(page.getByRole('img', {name: 'Co-applicant scorecard'})).toBeVisible();

    const decision = page.getByTestId('output-node-output');
    await expect(decision.getByTestId('output-value')).toHaveText('2 fields');
    await expect(decision.getByTestId('output-table')).toContainText('APPROVE');
    await expect(page.getByTestId('output-node-output2').getByTestId('output-table')).toContainText('1473.81');
});

test('capacityBook charts the largest affordable loan by term', async ({page}) => {
    await openStory(page, 'models-loan-origination--capacity-book');
    await expect(page.getByRole('img', {name: 'Largest affordable loan'})).toBeVisible(SLOW);
    await expect(page.getByTestId('output-node-output').getByTestId('output-value')).toHaveText('5 rows × 3 columns');
});

test('the service tests of joint and single applications pass when run', async ({page}) => {
    await openStory(page, 'models-loan-origination--service-tests');
    const summaries = page.getByTestId(/^assertion-summary-/);
    await expect(summaries).toHaveCount(6, SLOW);
    await expect(summaries.first()).toHaveText('');

    await page.getByRole('button', {name: 'Run all'}).click();
    for (let index = 0; index < 6; index++) await expect(summaries.nth(index)).toHaveText('11/11');
    await expect(page.locator('[data-mismatch="true"]')).toHaveCount(0);
});
