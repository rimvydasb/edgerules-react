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

async function editRelationCell(page: Page, row: string, index: number, value: string): Promise<void> {
    await valueCell(page, row).locator('span[tabindex="0"]').nth(index).click();
    await replaceActiveExpression(page, value);
    await page.keyboard.press('Enter');
}

test.describe('Boxed Editor / relations', () => {
    test('adds columns one at a time to every record', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await chooseRowAction(page, 'properties', 'Add column');
        await expectHeaders(page, 'properties', ['reference', 'value', 'column', 'address']);
        await chooseRowAction(page, 'properties', 'Add column');
        await expectHeaders(page, 'properties', ['reference', 'value', 'column', 'column2', 'address']);
        await expectLiveModel(page, /column2/);
    });

    test('deletes a column from every record', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await chooseRowAction(page, 'properties', 'Delete "value" column');
        await expectHeaders(page, 'properties', ['reference', 'address']);
        await expectLiveModel(page, /reference/);
        await expect(page.getByTestId('live-model')).not.toContainText('value:');
    });

    test('deletes the last remaining column and stays readable', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add relation');
        await chooseRowAction(page, 'relation', 'Add column');
        await chooseRowAction(page, 'relation', 'Delete "column" column');
        await expectHeaders(page, 'relation', []);
        await expectLiveResult(page, /"relation":\[\{\}\]/);
    });

    test('adds a record to an empty relation', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add relation');
        await chooseRowAction(page, 'relation[0]', 'Delete');
        await page.getByTestId('append-relation').click();
        await expect(page.getByTestId('row-relation[0]')).toBeVisible();
        await expectLiveResult(page, /"relation":\[""\]/);
    });

    test('duplicates a record', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await chooseRowAction(page, 'properties[0]', 'Duplicate');
        await expect(page.getByTestId('row-properties[3]')).toBeVisible();
        await expectLiveResult(page, /P-001/);
    });

    test('deletes a record', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await chooseRowAction(page, 'properties[2]', 'Delete');
        await expect(page.getByTestId('row-properties[2]')).toHaveCount(0);
        await expectLiveResult(page, /P-002/);
    });

    test('deletes the last record and keeps the relation linkable', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        for (let index = 2; index >= 0; index -= 1) await chooseRowAction(page, `properties[${index}]`, 'Delete');
        await expect(page.getByTestId('row-properties')).toBeVisible();
        await expectLiveResult(page, /Missing\('empty list'\)/);
    });

    test('reorders records and changes execution order', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await dragRow(page, 'properties[2]', 'properties[0]');
        await expectLiveResult(page, /properties.*P-003.*P-001/s);
    });

    test('re-authors a whole column from number to string', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add relation');
        await chooseRowAction(page, 'relation', 'Add column');
        await editRelationCell(page, 'relation[0]', 0, '1');
        await editRelationCell(page, 'relation[0]', 0, '"one"');
        await expectLiveResult(page, /"column":"one"/);
    });

    test('rejects a heterogeneous cell edit visibly', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await editRelationCell(page, 'properties[0]', 1, '"wrong"');
        await expect(page.getByTestId('row-error-properties[0]')).toBeVisible();
        await expectLiveResult(page, /"value":320000/);
    });

    test('leaves sibling records untouched after a rejected edit', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await editRelationCell(page, 'properties[0]', 1, '"wrong"');
        await expectLiveResult(page, /"value":180000.*"value":240000/s);
    });

    test('edits a nested field in a complex-object cell', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await commitExpression(page, 'properties[0].address.city', '"Trakai"');
        await expectLiveResult(page, /"city":"Trakai"/);
    });

    test('converts a flat cell into a drill-down object', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add relation');
        await chooseRowAction(page, 'relation', 'Add column');
        await editRelationCell(page, 'relation[0]', 0, '{ amount: 1 }');
        await expect(page.getByTestId('row-relation[0].column.amount')).toBeVisible();
        await expectLiveModel(page, /amount/);
    });

    test('renders a drill-down cell blank and non-interactive', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await expect(valueCell(page, 'properties[0]').locator('span[tabindex="0"]')).toHaveCount(2);
        await expect(page.locator('.cm-editor')).toHaveCount(0);
    });
});

test.describe('Boxed Editor / drag and drop', () => {
    test('reorders every named movable kind and keeps the full model live', async ({page}) => {
        test.setTimeout(60_000);
        await openBoxedEditorStory(page, 'full-model');
        for (const [from, to] of [
            ['Applicant', 'application'],
            ['application', 'reviewStages'],
            ['reviewStages', 'offices'],
            ['offices', 'monthly'],
            ['monthly', 'compute'],
            ['group', 'risk'],
            ['risk', 'factoryProduction'],
            ['factoryProduction', 'plan'],
        ] as const) {
            await dragRow(page, from, to);
            await expectLiveModel(page, new RegExp(from));
        }
    });

    test('reorders optimisation variables and constraints', async ({page}) => {
        await openBoxedEditorStory(page, 'full-model');
        await dragRow(page, 'factoryProduction.variables.chairs', 'factoryProduction.variables.tables');
        await expectLiveModel(page, /"@variables":\{"tables".*"chairs"/s);
        await dragRow(
            page,
            'factoryProduction.constraints.workerCapacity',
            'factoryProduction.constraints.stickSupply',
        );
        await expectLiveModel(page, /"@constraints":\{"stickSupply".*"workerCapacity"/s);
    });

    test('reorders relation items', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await dragRow(page, 'properties[1]', 'properties[0]');
        await expectLiveResult(page, /P-002.*P-001/s);
    });

    test('reorders list items', async ({page}) => {
        await openBoxedEditorStory(page, 'collections-list-and-relation');
        await dragRow(page, 'reviewStages[1]', 'reviewStages[0]');
        await expectLiveModel(page, /Underwriting.*Application/s);
    });

    test('reorders fields within a context', async ({page}) => {
        await openBoxedEditorStory(page, 'collections-list-and-relation');
        await dragRow(page, 'offices[0].address.zip', 'offices[0].address.city');
        await expectLiveModel(page, /zip.*city/s);
    });

    test('reparents a field between contexts', async ({page}) => {
        await openBoxedEditorStory(page, 'rename-overlay-playground');
        await dragRow(page, 'source.value', 'target.existing');
        await expectLiveModel(page, /target.*value/s);
    });

    test('rejects an invalid field drop without changing the model', async ({page}) => {
        await openBoxedEditorStory(page, 'collections-list-and-relation');
        const before = await page.getByTestId('live-model').textContent();
        await dragRow(page, 'offices[0].address.city', 'applicants[0]');
        await expect(page.getByTestId('live-model')).toHaveText(before ?? '');
    });

    test('appends by dropping on a trailing placeholder', async ({page}) => {
        await openBoxedEditorStory(page, 'collections-list-and-relation');
        await dragRow(page, 'reviewStages[0]', 'append-reviewStages');
        await expectLiveModel(page, /Underwriting.*Application/s);
    });

    test('does not expose handles for fixed row kinds', async ({page}) => {
        await openBoxedEditorStory(page, 'full-model');
        for (const path of ['*', 'eligibility.hitPolicy', 'eligibility.default']) {
            await expect(page.getByTestId(`row-${path}`).getByLabel('Drag to reorder row')).toHaveCount(0);
        }
    });

    test('rejects mismatched list-item kinds', async ({page}) => {
        await openBoxedEditorStory(page, 'collections-list-and-relation');
        const before = await page.getByTestId('live-model').textContent();
        await dragRow(page, 'reviewStages[0]', 'applicants[0]');
        await expect(page.getByTestId('live-model')).toHaveText(before ?? '');
    });

    test('keeps execution live after an accepted relation move', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        await dragRow(page, 'properties[0]', 'properties[2]');
        await expectLiveResult(page, /"properties"/);
    });

    test('keeps execution live after an accepted rule move', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await dragRow(page, 'collectable.rules[1]', 'collectable.rules[0]');
        await expectLiveResult(page, /"value":2/);
    });
});
