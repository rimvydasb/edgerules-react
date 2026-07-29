import {expect, test} from '@playwright/test';
import {renameHeader, retypeHeader} from './columnHelpers';
import {
    appendListItem,
    chooseRowAction,
    columnHeaders,
    commitExpression,
    dragRow,
    openBoxedEditorStory,
    renameRow,
    replaceActiveExpression,
    valueCell,
} from './helpers';

async function editTableCell(page: import('@playwright/test').Page, row: string, index: number, value: string) {
    await valueCell(page, row).locator('span[tabindex="0"]').nth(index).click();
    await replaceActiveExpression(page, value);
    await page.keyboard.press('Enter');
}

test.describe('Boxed Editor / business flow', () => {
    test('builds a loan origination and portfolio decisioning model from a blank start, surviving parse/link/argument failures along the way', async ({page}) => {
        test.setTimeout(240_000);
        await openBoxedEditorStory(page, 'blank-model');

        await test.step('1 — applicant and application intake', async () => {
            await page.getByTestId('append-*').click();
            await page.getByTestId('append-*').click();
            await page.getByTestId('append-*').click();
            await chooseRowAction(page, 'field', 'Convert to context');
            await renameRow(page, 'field', 'application');
            for (const [name, value] of [
                ['applicationDate', '@"2026-03-01"'],
                ['loanAmount', '250000'],
                ['propertyValue', '320000'],
            ]) {
                await page.getByTestId('append-application').click();
                const path = await renameRow(page, 'application.field', name);
                await commitExpression(page, path, value);
            }
            await chooseRowAction(page, 'field2', 'Delete');
            await chooseRowAction(page, 'field3', 'Delete');
            await chooseRowAction(page, '*', 'Add type');
            await renameRow(page, 'Type', 'Applicant');
            for (const name of ['name', 'age', 'income']) {
                await chooseRowAction(page, 'Applicant', 'Add field');
                const path = await renameRow(page, 'Applicant.field', name);
                await commitExpression(page, path, `<${name === 'name' ? 'string' : 'number'}>`);
            }
            await page.getByTestId('append-application').click();
            const applicant = await renameRow(page, 'application.field', 'applicant');
            await commitExpression(page, applicant, '<Applicant, required: true>');
            await expect(page.getByTestId('live-result')).toContainText('loanAmount');
        });

        await test.step('2 — required documents', async () => {
            await chooseRowAction(page, '*', 'Add list');
            await renameRow(page, 'list', 'requiredDocuments');
            for (const [index, value] of ['"payslip"', '"bank-statement"', '"property-valuation"'].entries()) {
                await appendListItem(page, 'requiredDocuments', index, value);
            }
            await expect(page.getByTestId('live-result')).toContainText('property-valuation');
        });

        await test.step('3 — collateral properties', async () => {
            await chooseRowAction(page, '*', 'Add relation');
            await renameRow(page, 'relation', 'collateralProperties');
            for (let index = 0; index < 3; index += 1) await chooseRowAction(page, 'collateralProperties', 'Add column');
            await renameHeader(page, 'collateralProperties', 'column', 'address');
            await renameHeader(page, 'collateralProperties', 'column2', 'value');
            await renameHeader(page, 'collateralProperties', 'column3', 'propertyType');
            await editTableCell(page, 'collateralProperties[0]', 2, '"residential"');
            await editTableCell(page, 'collateralProperties[0]', 1, '320000');
            await editTableCell(page, 'collateralProperties[0]', 0, '{ street: "Gedimino 9"; city: "Vilnius" }');
            await expect(page.getByTestId('row-collateralProperties[0]')).toBeVisible();
            await page.getByTestId('append-collateralProperties').click();
            await expect(page.getByTestId('row-collateralProperties[1]')).toBeVisible();
            await commitExpression(page, 'collateralProperties[1].address.street', '"Laisves 12"');
            await commitExpression(page, 'collateralProperties[1].address.city', '"Kaunas"');
        });

        await test.step('4 — calculations and the multi-argument path', async () => {
            await chooseRowAction(page, '*', 'Add function');
            await renameRow(page, 'function', 'monthlyPayment');
            await chooseRowAction(page, 'monthlyPayment', 'Add argument');
            await chooseRowAction(page, 'monthlyPayment', 'Add argument');
            await chooseRowAction(page, 'monthlyPayment', 'Add argument');
            for (const [from, to] of [['arg', 'amount'], ['arg2', 'annualRate'], ['arg3', 'years']] as const) {
                await renameHeader(page, 'monthlyPayment', from, to);
                await retypeHeader(page, 'monthlyPayment', to, 'number');
            }
            await commitExpression(
                page,
                'monthlyPayment.result',
                'amount * (1 + annualRate * years) / (12 * years)',
            );
            await chooseRowAction(page, '*', 'Add function');
            await renameRow(page, 'function', 'originationFee');
            await commitExpression(page, 'originationFee.result', '350');
            await chooseRowAction(page, '*', 'Add function');
            await renameRow(page, 'function', 'affordabilityScore');
            await chooseRowAction(page, 'affordabilityScore', 'Add argument');
            await chooseRowAction(page, 'affordabilityScore', 'Add argument');
            for (const [from, to] of [['arg', 'income'], ['arg2', 'payment']] as const) {
                await renameHeader(page, 'affordabilityScore', from, to);
                await retypeHeader(page, 'affordabilityScore', to, 'number');
            }
            await commitExpression(page, 'affordabilityScore.result', '1 - payment / (income / 12)');
            await chooseRowAction(page, 'application', 'Add function');
            await renameRow(page, 'application.function', 'loanToValue');
            await chooseRowAction(page, 'application.loanToValue', 'Add argument');
            await chooseRowAction(page, 'application.loanToValue', 'Add argument');
            await renameHeader(page, 'application.loanToValue', 'arg', 'amount');
            await renameHeader(page, 'application.loanToValue', 'arg2', 'value');
            await retypeHeader(page, 'application.loanToValue', 'amount', 'number');
            await retypeHeader(page, 'application.loanToValue', 'value', 'number');
            await commitExpression(page, 'application.loanToValue.result', 'amount / value');
            await expect(page.getByTestId('live-model')).toContainText('monthlyPayment');
        });

        await test.step('5 — unrelated mutation after callable work', async () => {
            await chooseRowAction(page, '*', 'Add relation');
            await renameRow(page, 'relation', 'checkpoint');
            await expect(page.getByTestId('row-checkpoint')).toBeVisible();
        });

        await test.step('6 — deliberate parse failure and recovery', async () => {
            await valueCell(page, 'monthlyPayment.result').click();
            await replaceActiveExpression(page, 'application.loanAmount /');
            await page.keyboard.press('Enter');
            await expect(page.getByRole('alert')).toContainText('Expected a value after "/"');
            // Engine functions cannot capture root fields (E101); the valid recovery stays local.
            await replaceActiveExpression(page, 'amount * (1 + annualRate * years) / (12 * years)');
            await page.keyboard.press('Enter');
            await expect(page.getByRole('alert')).toHaveCount(0);
        });

        await test.step('7 — safe argument maintenance', async () => {
            await chooseRowAction(page, 'monthlyPayment', 'Delete "years" argument');
            await expect(page.getByTestId('row-error-monthlyPayment')).toBeVisible();
            await chooseRowAction(page, 'monthlyPayment', 'Add argument');
            await renameHeader(page, 'monthlyPayment', 'arg', 'unused');
            await chooseRowAction(page, 'monthlyPayment', 'Delete "unused" argument');
            await expect(page.getByTestId('live-model')).toContainText('monthlyPayment');
        });

        await test.step('8 — risk-tiering decision table', async () => {
            await chooseRowAction(page, '*', 'Add decision table');
            await renameRow(page, 'decisionTable', 'riskTier');
            for (let index = 0; index < 3; index += 1) await chooseRowAction(page, 'riskTier', 'Add condition column');
            for (let index = 0; index < 3; index += 1) await chooseRowAction(page, 'riskTier', 'Add action column');
            for (const [from, to] of [['condition', 'age'], ['condition2', 'income'], ['condition3', 'ltv']] as const) {
                await renameHeader(page, 'riskTier', from, to);
                await retypeHeader(page, 'riskTier', to, 'number');
            }
            for (const [from, to] of [
                ['action', 'tier'],
                ['action2', 'maxExposure'],
                ['action3', 'expectedYield'],
            ] as const) await renameHeader(page, 'riskTier', from, to);
            for (let index = 0; index < 3; index += 1) await page.getByTestId('append-riskTier').click();
            for (const [row, values] of [
                ['riskTier.rules[0]', ['18..25', '< 30000', '> 0.8', '"high"', '1000000', '0.11']],
                ['riskTier.rules[1]', ['26..64', '>= 30000', '', '"medium"', '5000000', '0.07']],
                ['riskTier.rules[2]', ['>= 65', '', '', '"low"', '2000000', '0.05']],
            ] as const) {
                for (let index = values.length - 1; index >= 0; index -= 1) {
                    await editTableCell(page, row, index, values[index]);
                }
            }
            const defaultActions = ['"declined"', '0', '0'];
            for (let index = defaultActions.length - 1; index >= 0; index -= 1) {
                await editTableCell(page, 'riskTier.default', index, defaultActions[index]);
            }
            await expect(page.getByTestId('row-riskTier.rules[0]')).toBeVisible();
            await page.getByTestId('row-riskTier.hitPolicy').getByLabel('Change hit policy').click();
            await page.getByRole('menuitem', {name: 'best-match'}).click();
            await page.getByTestId('row-riskTier.hitPolicy').getByLabel('Change hit policy').click();
            await page.getByRole('menuitem', {name: 'first-match'}).click();
            await chooseRowAction(page, '*', 'Add field');
            await renameRow(page, 'field', 'riskResult');
            await commitExpression(page, 'riskResult', 'riskTier(age: 20, income: 25000, ltv: 0.9)');
            await expect(page.getByTestId('live-result')).toContainText('"tier":"high"');
        });

        await test.step('9 — portfolio optimisation', async () => {
            await chooseRowAction(page, '*', 'Add optimisation');
            await renameRow(page, 'optimisation', 'portfolioMix');
            await chooseRowAction(page, 'portfolioMix', 'Add argument');
            await renameHeader(page, 'portfolioMix', 'arg', 'capital');
            await retypeHeader(page, 'portfolioMix', 'capital', 'number');
            for (let index = 0; index < 2; index += 1) {
                await chooseRowAction(page, 'portfolioMix.variables', 'Add variable');
            }
            for (const [from, to] of [
                ['x', 'highTierLoans'],
                ['variable', 'mediumTierLoans'],
                ['variable2', 'lowTierLoans'],
            ] as const) await renameRow(page, `portfolioMix.variables.${from}`, to);
            await commitExpression(
                page,
                'portfolioMix.maximise',
                '0.11 * highTierLoans + 0.07 * mediumTierLoans + 0.05 * lowTierLoans',
            );
            for (const [from, to] of [
                ['limit', 'capitalAdequacy'],
                ['variableBound', 'highExposure'],
                ['variable2Bound', 'mediumExposure'],
            ] as const) await renameRow(page, `portfolioMix.constraints.${from}`, to);
            await commitExpression(
                page,
                'portfolioMix.constraints.capitalAdequacy',
                'highTierLoans + mediumTierLoans + lowTierLoans <= capital',
            );
            await commitExpression(page, 'portfolioMix.constraints.highExposure', 'highTierLoans <= 100');
            await commitExpression(page, 'portfolioMix.constraints.mediumExposure', 'mediumTierLoans <= 400');
            await chooseRowAction(page, 'portfolioMix', 'Add time limit');
            await chooseRowAction(page, 'portfolioMix.maximise', 'Switch to minimise');
            await chooseRowAction(page, 'portfolioMix.minimise', 'Switch to maximise');
            await expect(page.getByTestId('row-portfolioMix.maximise')).toBeVisible();
            await chooseRowAction(page, '*', 'Add field');
            await renameRow(page, 'field', 'portfolioPlan');
            await commitExpression(page, 'portfolioPlan', 'portfolioMix(capital: 500)');
            await expect(page.getByTestId('live-result')).toContainText('portfolioPlan');
        });

        await test.step('10 — rename under load', async () => {
            await renameRow(page, 'application', 'loanApplication');
            await expect(valueCell(page, 'riskResult')).toContainText('riskTier');
            await renameRow(page, 'loanApplication.loanAmount', 'requestedAmount');
            await renameHeader(page, 'collateralProperties', 'propertyType', 'usageType');
            await expect(page.getByTestId('live-model')).toContainText('loanApplication');
            await expect(page.getByTestId('live-result')).toContainText('portfolioPlan');
        });

        await test.step('11 — bulk maintenance pass', async () => {
            await page.getByTestId('append-riskTier').click();
            await dragRow(page, 'riskTier.rules[1]', 'riskTier.rules[0]');
            await chooseRowAction(page, 'riskTier.rules[0]', 'Duplicate');
            await chooseRowAction(page, 'riskTier.rules[2]', 'Delete');
            await chooseRowAction(page, 'riskResult', 'Delete');
            await chooseRowAction(page, 'riskTier', 'Add condition column');
            const addedCondition = (await columnHeaders(page, 'riskTier')).find(
                (name) => !['age', 'income', 'ltv', 'tier', 'maxExposure', 'expectedYield'].includes(name),
            );
            expect(addedCondition).toBeTruthy();
            await chooseRowAction(page, 'riskTier', 'Delete "ltv" column');
            await renameHeader(page, 'riskTier', addedCondition!, 'regionScore');
            await retypeHeader(page, 'riskTier', 'regionScore', 'number');
            await page.getByTestId('column-riskTier-regionScore').getByLabel('Move regionScore left').click();
            await chooseRowAction(page, '*', 'Add field');
            await renameRow(page, 'field', 'riskResult');
            await commitExpression(page, 'riskResult', 'riskTier(age: 20, income: 25000, regionScore: 0.9)');
            await expect(page.getByTestId('live-model')).toContainText('riskTier');
            await expect(page.getByTestId('live-result')).toContainText('portfolioPlan');
        });

        await test.step('12 — read-only reviewer handoff preserves the same service', async () => {
            const before = await page.getByTestId('live-model').textContent();
            await page.getByTestId('toggle-read-only').click();
            await expect(page.locator('[data-testid^="append-"]')).toHaveCount(0);
            await page.getByTestId('row-loanApplication').getByRole('button', {name: 'Open row actions'}).click();
            await expect(page.getByRole('menuitem', {name: 'Duplicate'})).toBeVisible();
            await expect(page.getByRole('menuitem', {name: 'Collapse'})).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(page.getByTestId('live-model')).toHaveText(before ?? '');
        });

        await test.step('13 — final execution and row-kind audit', async () => {
            await page.getByTestId('toggle-read-only').click();
            for (const [age, income, ltv, tier, capital, amount] of [
                [20, 25000, 0.9, 'high', 300, '100000'],
                [40, 60000, 0.6, 'medium', 500, '250000'],
                [70, 20000, 0.5, 'low', 700, '500000'],
            ] as const) {
                await commitExpression(
                    page,
                    'riskResult',
                    `riskTier(age: ${age}, income: ${income}, regionScore: ${ltv})`,
                );
                await expect(page.getByTestId('live-result')).toContainText(`"tier":"${tier}"`);
                await commitExpression(page, 'portfolioPlan', `portfolioMix(capital: ${capital})`);
                await expect(page.getByTestId('live-result')).toContainText('portfolioPlan');
                await commitExpression(page, 'loanApplication.requestedAmount', amount);
                await expect(page.getByTestId('live-result')).toContainText(`"requestedAmount":${amount}`);
            }
            for (const path of [
                '*',
                'loanApplication',
                'Applicant',
                'requiredDocuments',
                'requiredDocuments[0]',
                'collateralProperties',
                'collateralProperties[0]',
                'monthlyPayment',
                'monthlyPayment.result',
                'riskTier',
                'riskTier.hitPolicy',
                'riskTier.rules[0]',
                'riskTier.default',
                'portfolioMix',
                'portfolioMix.using',
                'portfolioMix.variables',
                'portfolioMix.maximise',
                'portfolioMix.constraints',
            ]) await expect(page.getByTestId(`row-${path}`)).toBeVisible();
            await expect(page.getByTestId('live-result')).toContainText('loanApplication');
        });
    });
});
