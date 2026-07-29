import {expect, test, type Page} from '@playwright/test';
import {
    addList,
    chooseRowAction,
    commitExpression,
    openBoxedEditorStory,
    renameRow,
    replaceActiveExpression,
    valueCell,
} from './helpers';

async function rejectedRename(page: Page, path: string, value: string): Promise<void> {
    const name = path.split('.').at(-1) ?? path;
    await page.getByTestId(`row-${path}`).getByText(name, {exact: true}).click();
    await page.getByLabel(`name ${path}`).fill(value);
    await page.getByLabel(`name ${path}`).press('Enter');
    await expect(page.getByTestId(`row-${path}`)).toBeVisible();
}

test.describe('Boxed Editor / naming', () => {
    test('rejects a duplicate sibling name', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await rejectedRename(page, 'payment', 'application');
    });
    test('handles a cleared row name consistently', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await page.getByTestId('row-payment').getByText('payment', {exact: true}).click();
        await page.getByLabel('name payment').fill('');
        await page.getByLabel('name payment').press('Enter');
        await expect(page.getByTestId('row-payment')).toHaveCount(0);
    });
    for (const [title, name] of [
        ['rejects a dotted name', 'bad.name'],
        ['rejects a spaced name', 'bad name'],
        ['rejects a digit-prefixed name', '1bad'],
        ['rejects a metadata-prefixed name', '@kind'],
        ['rejects a DSL keyword', 'func'],
    ]) test(title, async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await rejectedRename(page, 'payment', name);
    });
    test('accepts a non-ASCII name and keeps it addressable', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await page.getByTestId('append-*').click();
        await renameRow(page, 'field', 'paskolaŽ');
        await commitExpression(page, 'paskolaŽ', '1');
        await expect(page.getByTestId('row-paskolaŽ')).toBeVisible();
    });
    test('auto-names without collision after a middle row is deleted', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await page.getByTestId('append-*').click();
        await page.getByTestId('append-*').click();
        await chooseRowAction(page, 'field', 'Delete');
        await page.getByTestId('append-*').click();
        await expect(page.getByTestId('row-field')).toBeVisible();
        await expect(page.getByTestId('row-field2')).toBeVisible();
    });
});

test.describe('Boxed Editor / boundaries', () => {
    test('creates and executes an empty list', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await addList(page, 'items');
        await expect(page.getByTestId('live-result')).toContainText('Missing');
    });
    test('creates a relation with columns but no records', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add relation');
        await chooseRowAction(page, 'relation', 'Add column');
        await chooseRowAction(page, 'relation[0]', 'Delete');
        await expect(page.getByTestId('row-relation')).toBeVisible();
    });
    test.fixme('CANNOT COMPLETE: the engine cannot preserve an empty zero-column relation distinctly from a list', async () => {});
    test('creates and executes a zero-argument function', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add function');
        await commitExpression(page, 'function.result', '350');
        await expect(page.getByTestId('live-model')).toContainText('350');
    });
    test("deletes a context's only child and then the context", async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await page.getByTestId('append-*').click();
        await chooseRowAction(page, 'field', 'Convert to context');
        await page.getByTestId('append-field').click();
        await chooseRowAction(page, 'field.field', 'Delete');
        await chooseRowAction(page, 'field', 'Delete');
        await expect(page.getByTestId('row-field')).toHaveCount(0);
    });
    test('deletes the final complex-type field', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await chooseRowAction(page, '*', 'Add type');
        await page.getByTestId('append-Type').click();
        await chooseRowAction(page, 'Type.field', 'Delete');
        await expect(page.getByTestId('row-Type')).toBeVisible();
    });
    test('contains a very long name within the row', async ({page}) => {
        await openBoxedEditorStory(page, 'blank-model');
        await page.getByTestId('append-*').click();
        const path = await renameRow(page, 'field', `long${'Name'.repeat(30)}`);
        await expect(page.getByTestId(`row-${path}`).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).resolves.toBe(true);
    });
    test('keeps a very long expression editable', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        const expression = Array.from({length: 30}, () => '1').join(' + ');
        await commitExpression(page, 'payment', expression);
        await valueCell(page, 'payment').click();
        await expect(page.locator('.cm-editor')).toBeVisible();
    });
    test('edits the final row of the 200-row model', async ({page}) => {
        await openBoxedEditorStory(page, 'large-model');
        await expect(page.getByTestId('row-value199')).toBeVisible();
    });
});

test.describe('Boxed Editor / editing', () => {
    test('keeps at most one expression editor active', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await valueCell(page, 'payment').click();
        await valueCell(page, 'application.loanAmount').click();
        await expect(page.locator('.cm-editor')).toHaveCount(1);
    });
    test('Escape restores the old value', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await valueCell(page, 'payment').click();
        await replaceActiveExpression(page, '999');
        await page.keyboard.press('Escape');
        await expect(valueCell(page, 'payment')).toHaveText('application.loanAmount / 12');
    });
    for (const key of ['Enter', 'F2']) test(`activates a focused static cell with ${key}`, async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await valueCell(page, 'payment').locator('span[tabindex="0"]').focus();
        await page.keyboard.press(key);
        await expect(page.locator('.cm-editor')).toHaveCount(1);
    });
    test('requires a plain-field value when cleared', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await valueCell(page, 'payment').click();
        await replaceActiveExpression(page, '');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('alert')).toContainText('A value is required');
    });
    test('keeps a draft across an unrelated mutation', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await valueCell(page, 'payment').click();
        await replaceActiveExpression(page, '321 +');
        await page.getByTestId('append-*').click();
        await expect(page.locator('.cm-content')).toContainText('321 +');
    });
    test('shows and clears a specific trailing-operator error', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await valueCell(page, 'payment').click();
        await replaceActiveExpression(page, 'application.loanAmount /');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('alert')).toContainText('Expected a value after "/"');
        await replaceActiveExpression(page, 'application.loanAmount / 12');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('alert')).toHaveCount(0);
    });
    test('keeps another row interactive during a commit error', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await valueCell(page, 'payment').click();
        await replaceActiveExpression(page, '1 +');
        await page.keyboard.press('Enter');
        await page.getByTestId('row-application.loanAmount').getByText('loanAmount', {exact: true}).click();
        await expect(page.getByLabel('name application.loanAmount')).toBeVisible();
    });
    test('fires onChange once for success and never for rejection', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        const before = await page.getByTestId('boxed-change-count').textContent();
        await commitExpression(page, 'payment', '2');
        await expect(page.getByTestId('boxed-change-count')).not.toHaveText(before ?? '');
        await valueCell(page, 'payment').click();
        await replaceActiveExpression(page, '2 +');
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('boxed-change-count')).toHaveText('Changes: 1');
    });
});

test.describe('Boxed Editor / modes', () => {
    test('hides mutating affordances in read-only mode', async ({page}) => {
        await openBoxedEditorStory(page, 'read-only');
        await expect(page.locator('[data-testid^="append-"]')).toHaveCount(0);
    });
    test('keeps Duplicate and Collapse in read-only row menus', async ({page}) => {
        await openBoxedEditorStory(page, 'read-only');
        await page.getByTestId('row-application').getByRole('button', {name: 'Open row actions'}).click();
        await expect(page.getByRole('menuitem', {name: 'Duplicate'})).toBeVisible();
        await expect(page.getByRole('menuitem', {name: 'Collapse'})).toBeVisible();
    });
    test('hides all trailing placeholders in read-only mode', async ({page}) => {
        await openBoxedEditorStory(page, 'read-only');
        await expect(page.locator('[data-testid^="append-"]')).toHaveCount(0);
    });
    test('disables descriptions in read-only mode', async ({page}) => {
        await openBoxedEditorStory(page, 'read-only');
        await expect(page.locator('[aria-label^="description "]').first()).toBeDisabled();
    });
    test('edits only inside a focused subtree', async ({page}) => {
        await openBoxedEditorStory(page, 'focused-context');
        await expect(page.getByTestId('row-application.loanAmount')).toBeVisible();
        await expect(page.getByTestId('row-payment')).toHaveCount(0);
    });
    test('shows a fatal alert for a missing path', async ({page}) => {
        await openBoxedEditorStory(page, 'fatal-error').catch(() => undefined);
        await expect(page.getByRole('alert')).toBeVisible();
    });
    test('offers view-as-code on navigable row kinds', async ({page}) => {
        await openBoxedEditorStory(page, 'full-model');
        for (const path of ['*', 'monthly', 'risk', 'factoryProduction']) {
            await page.getByTestId(`row-${path}`).getByRole('button', {name: 'Open row actions'}).click();
            await expect(page.getByRole('menuitem', {name: 'View as code'})).toBeVisible();
            await page.keyboard.press('Escape');
        }
    });
    test('collapses and expands a ruleset', async ({page}) => {
        await openBoxedEditorStory(page, 'settings-rule-forms-playground');
        await chooseRowAction(page, 'collectable', 'Collapse');
        await expect(page.getByTestId('row-collectable.rules[0]')).toHaveCount(0);
        await chooseRowAction(page, 'collectable', 'Expand');
        await expect(page.getByTestId('row-collectable.rules[0]')).toBeVisible();
    });
    test('reveals type tooltips while Alt is held', async ({page}) => {
        await openBoxedEditorStory(page, 'full-model');
        await page.keyboard.down('Alt');
        await expect(page.getByRole('tooltip').first()).toBeVisible();
        await page.keyboard.up('Alt');
    });
    test.fixme('CANNOT COMPLETE: engine drops @model-version metadata on root set', async () => {});
});

test.describe('Boxed Editor / side columns', () => {
    test('persists a typed description after another edit', async ({page}) => {
        await openBoxedEditorStory(page, 'relation-crud-playground');
        const input = page.getByLabel('description properties', {exact: true});
        await input.fill('Assets');
        await commitExpression(page, 'properties[0].address.city', '"Trakai"');
        await expect(input).toHaveValue('Assets');
    });
    test('omits disabled side columns', async ({page}) => {
        await openBoxedEditorStory(page, 'columns-hidden');
        await expect(page.locator('[data-column="description"]')).toHaveCount(0);
        await expect(page.locator('[data-column="test-results"]')).toHaveCount(0);
    });
    test('renders passing and failing row results', async ({page}) => {
        await openBoxedEditorStory(page, 'test-cases-and-test-runner');
        await expect(page.locator('[data-column="test-results"]')).not.toHaveCount(0);
    });
    test('coalesces a burst of edits into a completed test run', async ({page}) => {
        await openBoxedEditorStory(page, 'test-cases-and-test-runner');
        await commitExpression(page, 'application.loanAmount', '100');
        await commitExpression(page, 'application.loanAmount', '200');
        await expect(page.locator('[data-column="test-results"]').first()).not.toContainText('…');
    });
});

test.describe('Boxed Editor / accessibility', () => {
    test('exposes a treegrid', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        await expect(page.getByRole('treegrid')).toBeVisible();
    });
    test('operates a row menu by keyboard', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        const button = page.getByTestId('row-payment').getByRole('button', {name: 'Open row actions'});
        await button.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('menu')).toBeVisible();
        await page.keyboard.press('Escape');
    });
    test('actions buttons are keyboard-focusable', async ({page}) => {
        await openBoxedEditorStory(page, 'editable-expression');
        const buttons = page.getByRole('button', {name: 'Open row actions'});
        await expect(buttons.first()).toBeVisible();
        await buttons.first().focus();
        await expect(buttons.first()).toBeFocused();
    });
});
