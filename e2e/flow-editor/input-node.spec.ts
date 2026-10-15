import { test, expect, type Page } from '@playwright/test';
import { openStory } from '../support/storybook';

const PREFIX = 'flow-editor-inputnode--';

async function open(page: Page, story: string) {
  await openStory(page, `${PREFIX}${story}`);
  // xyflow hides a node until it is measured.
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
}

function handle(page: Page, nodeId: string, handleId: string) {
  return page.locator(`.react-flow__node[data-id="${nodeId}"] [data-handleid="${handleId}"]`);
}

async function centerY(locator: ReturnType<Page['locator']>): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return box.y + box.height / 2;
}

// The wire of `name` must start at its output pin and end at its argument pin, wherever the rows are now.
async function expectWireAtPins(page: Page, name: string) {
  const path = page
    .locator(`[data-testid="rf__edge-applicant.${name}->${name}"] .react-flow__edge-path`)
    .first();
  const wire = await path.boundingBox();
  if (!wire) throw new Error(`no wire for ${name}`);
  const source = await centerY(handle(page, 'applicant', `out:${name}`));
  const target = await centerY(handle(page, 'decision', `in:${name}`));
  expect(wire.y).toBeCloseTo(Math.min(source, target), -1);
  expect(wire.y + wire.height).toBeCloseTo(Math.max(source, target), -1);
}

async function fieldMenu(page: Page, name: string) {
  await page.getByRole('button', { name: `Actions for field ${name}` }).click();
}

test('shows one pin per field and the whole-record pin', async ({ page }) => {
  await open(page, 'default');

  for (const name of ['age', 'income', 'segment', '*']) {
    await expect(handle(page, 'applicant', `out:${name}`)).toBeVisible();
  }
  await expect(page.getByText('FIELDS')).toBeVisible();
  await expect(page.getByText('retail')).toHaveCount(0);
});

test('the node keeps its right border on every row', async ({ page }) => {
  await open(page, 'default');
  const node = page.getByTestId('input-node-applicant');
  const box = await node.boundingBox();
  const row = await page.getByRole('button', { name: 'segment', exact: true }).boundingBox();
  if (!box || !row) throw new Error('no box');
  const borderRight = await node.evaluate((element) => getComputedStyle(element).borderRightWidth);
  expect(borderRight).toBe('1px');
  expect(row.x + row.width).toBeLessThan(box.x + box.width);
});

test('Move down keeps every wire on its own pin', async ({ page }) => {
  await open(page, 'wired');
  for (const name of ['age', 'income', 'segment']) await expectWireAtPins(page, name);

  await fieldMenu(page, 'age');
  await page.getByRole('menuitem', { name: 'Move down' }).click();

  await expect(page.getByText('{ income, age, segment }')).toBeVisible();
  // age is now the second row and income the first; the wires cross instead of joining the wrong rows.
  expect(await centerY(handle(page, 'applicant', 'out:age'))).toBeGreaterThan(
    await centerY(handle(page, 'applicant', 'out:income')),
  );
  for (const name of ['age', 'income', 'segment']) await expectWireAtPins(page, name);
});

test('Move up after Move down puts the wires back', async ({ page }) => {
  await open(page, 'wired');

  await fieldMenu(page, 'age');
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  await expect(page.getByText('{ income, age, segment }')).toBeVisible();
  await fieldMenu(page, 'age');
  await page.getByRole('menuitem', { name: 'Move up' }).click();

  await expect(page.getByText('{ age, income, segment }')).toBeVisible();
  for (const name of ['age', 'income', 'segment']) await expectWireAtPins(page, name);
});

test('Move up and Move down are disabled on the first and last rows', async ({ page }) => {
  await open(page, 'default');

  await fieldMenu(page, 'age');
  await expect(page.getByRole('menuitem', { name: 'Move up' })).toHaveAttribute(
    'data-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Actions for field age' })).toHaveCount(0);
  await fieldMenu(page, 'segment');
  await expect(
    page
      .getByRole('menu', { name: 'Actions for field segment' })
      .getByRole('menuitem', { name: 'Move down' }),
  ).toHaveAttribute('data-disabled', 'true');
});

test('Delete field is disabled for a field that a function reads', async ({ page }) => {
  await open(page, 'wired');

  await fieldMenu(page, 'age');
  await expect(page.getByRole('menuitem', { name: 'Delete field' })).toHaveAttribute(
    'data-disabled',
    'true',
  );
});

test('adds a field below a row, names it, and then deletes it', async ({ page }) => {
  await open(page, 'wired');

  await fieldMenu(page, 'age');
  await page.getByRole('menuitem', { name: 'Add field below' }).click();
  const input = page.getByLabel('Rename field field');
  await input.fill('region');
  await input.press('Enter');
  await expect(page.getByText('{ age, region, income, segment }')).toBeVisible();
  await expect(handle(page, 'applicant', 'out:region')).toBeVisible();
  // The existing wires stay on their own pins after a row is inserted above them.
  for (const name of ['age', 'income', 'segment']) await expectWireAtPins(page, name);

  await fieldMenu(page, 'region');
  await page.getByRole('menuitem', { name: 'Delete field' }).click();
  await expect(page.getByText('{ age, income, segment }')).toBeVisible();
  await expect(handle(page, 'applicant', 'out:region')).toHaveCount(0);
  for (const name of ['age', 'income', 'segment']) await expectWireAtPins(page, name);
});

test('renaming a field moves its wire to the renamed pin', async ({ page }) => {
  await open(page, 'wired');

  await page.getByRole('button', { name: 'age', exact: true }).first().click();
  const input = page.getByLabel('Rename field age');
  await input.fill('years');
  await input.press('Enter');

  await expect(page.getByRole('button', { name: 'years', exact: true })).toBeVisible();
  await expect(handle(page, 'applicant', 'out:years')).toBeVisible();
  await expect(page.locator('[data-testid="rf__edge-applicant.years->age"]')).toHaveCount(1);
});

test('renames the node and adds a description', async ({ page }) => {
  await open(page, 'default');

  await page.getByRole('button', { name: 'Node actions' }).click();
  await page.getByRole('menuitem', { name: 'Rename node' }).click();
  const name = page.getByLabel('Name of node applicant');
  await name.fill('Applicant data');
  await name.press('Enter');
  await expect(page.getByText('Applicant data')).toBeVisible();

  await page.getByRole('button', { name: 'Node actions' }).click();
  await page.getByRole('menuitem', { name: 'Add description' }).click();
  const description = page.getByLabel('Description of applicant');
  await description.fill('Who applies');
  await description.press('Enter');
  await expect(page.getByText('Who applies')).toBeVisible();
});
