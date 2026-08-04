import {expect, test, type Page} from '@playwright/test';
import {
    chooseRowAction,
    dragRow,
    expectLiveModel,
    expectRowError,
    openBoxedEditorStory,
    renameRow,
} from './helpers';
import {renameHeader} from './columnHelpers';

test.describe('Boxed Editor / rename', () => {
    async function attemptRejectedRename(page: Page): Promise<void> {
        await page.getByTestId('row-principal').getByText('principal', {exact: true}).click();
        await page.getByLabel('name principal').fill('months');
        await page.getByLabel('name principal').press('Enter');
    }

    test('renames an unreferenced field and keeps the model executing', async ({page}) => {
        await openBoxedEditorStory(page, 'rename-overlay-playground');
        await renameRow(page, 'free', 'available');
        await expectLiveModel(page, /"available"/);
    });

    test('renames a referenced context and migrates dependent expressions', async ({page}) => {
        await openBoxedEditorStory(page, 'rename-overlay-playground');
        await renameRow(page, 'source', 'origin');
        await expectLiveModel(page, /"sourceValue".*"expression":"origin\.value"/s);
    });

    test('renames a referenced nested row and migrates a sibling expression', async ({page}) => {
        await openBoxedEditorStory(page, 'rename-overlay-playground');
        await renameRow(page, 'source.value', 'amount');
        await expectLiveModel(page, /"doubled".*"expression":"amount \* 2"/s);
    });

    test('renames a function and migrates its call site', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await renameRow(page, 'payment', 'installment');
        await expectLiveModel(page, /"@method":"installment"/);
    });

    test('renames a row referenced from a decision-table rule', async ({page}) => {
        await openBoxedEditorStory(page, 'decision-table-crud-playground');
        await renameHeader(page, 'risk', 'age', 'years');
        await expectLiveModel(page, /"@parameters":\{"years"/);
        await expectLiveModel(page, /"when":\{"years"/);
    });

    test('renames a row referenced from an optimisation constraint', async ({page}) => {
        await openBoxedEditorStory(page, 'full-model');
        await renameRow(page, 'factoryProduction.variables.chairs', 'stools');
        await expectLiveModel(page, /"@maximise":"15 \* stools/);
        await expectLiveModel(page, /"workerCapacity":"1 \* stools/);
    });

    test('reports a visible error without corrupting the model when migration is unavailable', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        const before = await page.getByTestId('live-model').textContent();
        await attemptRejectedRename(page);
        await expectRowError(page, 'principal', /principal|reference|link/i);
        await expectLiveModel(page, before ?? '');
    });

    test('keeps accepting unrelated edits after a rejected rename', async ({page}) => {
        await openBoxedEditorStory(page, 'function-crud-playground');
        await attemptRejectedRename(page);
        await chooseRowAction(page, '*', 'Add field');
        await expect(page.getByTestId('row-field')).toBeVisible();
    });

    test("migrates a row's description across its rename", async ({page}) => {
        await openBoxedEditorStory(page, 'rename-overlay-playground');
        await renameRow(page, 'source', 'renamed');
        await expect(page.getByTestId('overlay-descriptions')).toContainText('renamed:Source context');
    });

    test("migrates a nested description across its ancestor's rename", async ({page}) => {
        await openBoxedEditorStory(page, 'rename-overlay-playground');
        await renameRow(page, 'source', 'renamed');
        await expect(page.getByTestId('overlay-descriptions')).toContainText('renamed.value:Nested value');
    });

    test('migrates test-case cells across a rename', async ({page}) => {
        await openBoxedEditorStory(page, 'rename-overlay-playground');
        await renameRow(page, 'source', 'renamed');
        await expect(page.getByTestId('overlay-test-cell')).toContainText('renamed.value:42');
    });

    test('migrates test-case cells across a drag-move', async ({page}) => {
        await openBoxedEditorStory(page, 'rename-overlay-playground');
        await dragRow(page, 'source.value', 'target.existing');
        await expect(page.getByTestId('overlay-test-cell')).toContainText('target.value:42');
    });
});
