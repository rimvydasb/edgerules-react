import { test, expect, type Page } from '@playwright/test';

async function dragByHandle(page: Page, source: string, target: string) {
  const sourceBox = await page
    .getByRole('button', { name: `Drag ${source}`, exact: true })
    .boundingBox();
  const targetBox = await page
    .getByRole('button', { name: `Drag ${target}`, exact: true })
    .boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Drag handles are not visible');
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
}

async function editExpression(
  page: Page,
  path: string,
  initialValue: string,
  nextValue: string,
) {
  const row = page.getByRole('row', { name: path, exact: true });
  const relationCell = page.getByRole('cell', { name: path, exact: true });
  const target = row.getByRole('cell').nth(3).or(relationCell).first();
  await target.click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveCount(1);
  await expect(editor).toHaveText(initialValue);
  await editor.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.type(nextValue);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(target).toContainText(nextValue);
}

const BOXED_EDITOR_STORIES = [
  'root-read-only',
  'focused-function',
  'inline-function',
  'context-function',
  'external-function',
  'invocation',
  'literal-list',
  'relation',
  'loan-origination-overview',
  'loan-origination-overview-read-only',
  'error-state',
  'nested-function-visual',
  'large-model-visual',
  'project-explorer-integration',
] as const;

test('read-only loan origination opens from the Storybook manager route', async ({
  page,
}) => {
  await page.goto(
    '/?path=/story/boxed-editor-boxededitor--loan-origination-overview-read-only',
  );
  const story = page.frameLocator('#storybook-preview-iframe');
  await expect(story.getByRole('treegrid')).toBeVisible();
  await expect(
    story.getByText('The component failed to render properly'),
  ).not.toBeVisible();
});

test('every Boxed Editor story opens without the Storybook render error boundary', async ({
  page,
}) => {
  for (const story of BOXED_EDITOR_STORIES) {
    await test.step(story, async () => {
      await page.goto(
        `/iframe.html?id=boxed-editor-boxededitor--${story}&viewMode=story`,
      );
      await expect(
        page.locator('[role="treegrid"], [role="alert"]').first(),
      ).toBeVisible();
      await expect(
        page.getByText('The component failed to render properly'),
      ).not.toBeVisible();
    });
  }
});

test('editable boxed expression mounts one cell editor and commits', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview&viewMode=story',
  );
  await page.getByRole('button', { name: 'Expand application' }).click();
  const calculationRow = page.getByRole('row', {
    name: 'application.calculation',
  });
  await calculationRow.getByRole('cell').nth(3).click();
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveCount(1);
  await editor.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.type('1 + 2');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('boxed-change-count')).toContainText(
    'Changes: 1',
  );
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('editable cells retain language-service completions from their portable embed context', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview&viewMode=story',
  );
  await page.getByRole('button', { name: 'Expand application' }).click();
  await page
    .getByRole('row', { name: 'application.calculation' })
    .getByRole('cell')
    .nth(3)
    .click();
  const editor = page.locator('.cm-content');
  await editor.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.type('a');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText(
    'amount',
  );
});

test('expression editing initializes and commits every boxed value shape', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview&viewMode=story',
  );
  await page.getByRole('button', { name: 'Expand application' }).click();
  await editExpression(
    page,
    'application.calculation',
    'amount * 0.2',
    'amount * 0.25',
  );
  await page.getByRole('button', { name: 'Expand monthly' }).click();
  await editExpression(page, 'monthly.result', 'amount / 12', 'amount / 6');
  await expect(page.getByTestId('boxed-change-count')).toContainText(
    'Changes: 2',
  );

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--context-function&viewMode=story',
  );
  await editExpression(page, 'summary.tax', 'amount * 0.2', 'amount * 0.25');

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--literal-list&viewMode=story',
  );
  await editExpression(page, 'scores[0]', '12', '13');

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--relation&viewMode=story',
  );
  await editExpression(page, 'applicants[0].age', '36', '37');

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--invocation&viewMode=story',
  );
  await editExpression(page, 'payment', 'monthly(1200)', 'monthly(600)');
});

test('one cell editor changes number to input to string without dialogs or errors', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview&viewMode=story',
  );
  await page.getByRole('button', { name: 'Expand application' }).click();
  const row = page.getByRole('row', {
    name: 'application.mutableValue',
    exact: true,
  });
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

  await row.getByRole('cell').nth(3).click();
  let editor = page.locator('.cm-content');
  await expect(editor).toHaveText('1');
  await editor.click();
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.insertText('<number, 5>');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(row).toContainText('<number, default: 5>');
  await expect(row).toContainText('number · input');

  await row.getByRole('cell').nth(3).click();
  editor = page.locator('.cm-content');
  await expect(editor).toHaveText('<number, default: 5>');
  await editor.click();
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.insertText('"text"');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(row).toContainText('string · computed');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('boxed editor does not expose metadata editing', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview&viewMode=story',
  );
  await page.getByRole('button', { name: 'Expand application' }).click();
  await expect(page.getByRole('button', { name: /metadata/i })).toHaveCount(0);
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('read-only boxed story exposes no expression editor activation', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--root-read-only&viewMode=story',
  );
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Add field to *' }),
  ).toHaveCount(0);
});

test('drag handles reorder authored fields, function bodies, lists, and relations', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview&viewMode=story',
  );
  await dragByHandle(page, 'payment', 'application');
  await expect
    .poll(async () => {
      const payment = await page
        .getByRole('row', { name: 'payment' })
        .boundingBox();
      const application = await page
        .getByRole('row', { name: 'application', exact: true })
        .boundingBox();
      return Boolean(payment && application && payment.y < application.y);
    })
    .toBe(true);
  await expect(page.getByTestId('boxed-change-count')).toContainText(
    'Changes: 1',
  );

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview&viewMode=story',
  );
  await page.getByRole('button', { name: 'Expand application' }).click();
  await dragByHandle(page, 'application.calculation', 'application.amount');
  await expect
    .poll(async () => {
      const calculation = await page
        .getByRole('row', { name: 'application.calculation' })
        .boundingBox();
      const amount = await page
        .getByRole('row', { name: 'application.amount' })
        .boundingBox();
      return Boolean(calculation && amount && calculation.y < amount.y);
    })
    .toBe(true);

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--context-function&viewMode=story',
  );
  await dragByHandle(page, 'summary.result', 'summary.tax');
  await expect
    .poll(async () => {
      const result = await page
        .getByRole('row', { name: 'summary.result' })
        .boundingBox();
      const tax = await page
        .getByRole('row', { name: 'summary.tax' })
        .boundingBox();
      return Boolean(result && tax && result.y < tax.y);
    })
    .toBe(true);

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--literal-list&viewMode=story',
  );
  await dragByHandle(page, 'scores[0]', 'scores[2]');
  await expect(page.getByRole('row', { name: 'scores[0]' })).toContainText(
    '19',
  );
  await expect(page.getByRole('row', { name: 'scores[2]' })).toContainText(
    '12',
  );

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--relation&viewMode=story',
  );
  await dragByHandle(page, 'applicants[0]', 'applicants[1]');
  await expect(page.getByRole('row', { name: 'applicants[0]' })).toContainText(
    'Grace',
  );
  await expect(page.getByRole('row', { name: 'applicants[1]' })).toContainText(
    'Ada',
  );
});

test('relationship columns can be added, renamed inline, and reordered', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--relation&viewMode=story',
  );
  const table = page.getByRole('table', { name: 'applicants relationship' });
  await expect(table.getByRole('columnheader').nth(1)).toContainText('name');
  await expect(table.getByRole('columnheader').nth(2)).toContainText('age');

  await page.getByRole('button', { name: 'Add column to applicants' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Column name').fill('active');
  await dialog.getByLabel('Default expression').fill('true');
  await dialog.getByRole('button', { name: 'Save column' }).click();
  await page
    .getByRole('button', { name: 'Edit column name applicants.active' })
    .click();
  const input = page.getByLabel('Column name applicants.active');
  await input.fill('enabled');
  await input.press('Enter');
  await expect(
    page.getByRole('button', {
      name: 'Edit column name applicants.enabled',
    }),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: 'applicants[0]' })).toContainText(
    'true',
  );

  await dragByHandle(page, 'column applicants.name', 'column applicants.age');
  await expect(table.getByRole('columnheader').nth(1)).toContainText('age');
  await expect(table.getByRole('columnheader').nth(2)).toContainText('name');
});

test('loan-origination stories share the same complex list and relationship model', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview&viewMode=story',
  );
  await expect(page.getByRole('treegrid')).toContainText('Applicant');
  await expect(
    page.getByRole('row', { name: 'application', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('func creditScore(age: number, income: number) → number'),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: 'finalDecision' })).toContainText(
    'APPROVE',
  );
  await page.getByRole('button', { name: 'Expand reviewStages' }).click();
  await expect(
    page.getByRole('row', { name: 'reviewStages[0]' }),
  ).toContainText('Application');
  await page.getByRole('button', { name: 'Expand recentApplications' }).click();
  const editableRelation = page.getByRole('table', {
    name: 'recentApplications relationship',
  });
  await expect(editableRelation).toBeVisible();
  await expect(
    editableRelation.getByRole('row', { name: 'recentApplications[0]' }),
  ).toContainText('LOAN-2026-001');
  await expect(
    page.getByRole('button', { name: 'Drag recentApplications[0]' }),
  ).toBeEnabled();

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview-read-only&viewMode=story',
  );
  await page.getByRole('button', { name: 'Expand reviewStages' }).click();
  await expect(
    page.getByRole('row', { name: 'reviewStages[0]' }),
  ).toContainText('Application');
  await page.getByRole('button', { name: 'Expand recentApplications' }).click();
  const readOnlyRelation = page.getByRole('table', {
    name: 'recentApplications relationship',
  });
  await expect(readOnlyRelation).toBeVisible();
  await expect(
    readOnlyRelation.getByRole('row', { name: 'recentApplications[0]' }),
  ).toContainText('LOAN-2026-001');
  const applicationHandle = page.getByRole('button', {
    name: 'Drag application',
  });
  await expect(applicationHandle).toBeVisible();
  await expect(applicationHandle).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Edit name finalDecision' }),
  ).toHaveCount(0);
  await page
    .getByRole('row', { name: 'finalDecision' })
    .getByRole('cell')
    .nth(3)
    .click();
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('relationship renders object fields as table columns without nested row labels', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--relation&viewMode=story',
  );
  const table = page.getByRole('table', { name: 'applicants relationship' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader').nth(1)).toContainText('name');
  await expect(table.getByRole('columnheader').nth(2)).toContainText('age');
  await expect(table.getByRole('columnheader').nth(3)).toContainText('contact');
  await expect(page.getByText('Row 1')).toHaveCount(0);
  await expect(page.getByText('2 relationship rows · 3 columns')).toHaveCount(
    0,
  );
  const contact = page.getByRole('cell', {
    name: 'applicants[0].contact',
    exact: true,
  });
  await expect(contact).toHaveAttribute('aria-expanded', 'false');
  await expect(contact).toHaveText('contact');
  await contact.click();
  await expect(contact).toHaveAttribute('aria-expanded', 'true');
  await expect(
    contact.getByRole('row', { name: 'applicants[0].contact.address' }),
  ).toBeVisible();
  await expect(
    contact.getByRole('button', {
      name: 'Edit metadata applicants[0].contact.address',
    }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Expand applicants[0].contact.address' })
    .click();
  await page
    .getByRole('button', {
      name: 'Expand applicants[0].contact.address.location',
    })
    .click();
  await expect(
    page.getByRole('row', {
      name: 'applicants[0].contact.address.location.city',
    }),
  ).toContainText("'London'");
});

test('deeply nested relationship tables retain their complete child inset', async ({
  page,
}, testInfo) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--deep-relation&viewMode=story',
  );
  await page.getByRole('button', { name: 'Expand organization' }).click();
  await page
    .getByRole('button', { name: 'Expand organization.division' })
    .click();
  await page
    .getByRole('button', {
      name: 'Expand organization.division.department',
    })
    .click();
  await page
    .getByRole('button', {
      name: 'Expand organization.division.department.applicants',
    })
    .click();

  const relationPath = 'organization.division.department.applicants';
  const relation = page.getByRole('row', { name: relationPath, exact: true });
  const table = page.getByRole('table', {
    name: `${relationPath} relationship`,
  });
  await expect(relation).toHaveCSS('padding-left', '64px');
  await expect(table.locator('..')).toHaveCSS('margin-left', '80px');

  const editorBounds = await page.getByRole('treegrid').boundingBox();
  const tableBounds = await table.boundingBox();
  expect(editorBounds).not.toBeNull();
  expect(tableBounds).not.toBeNull();
  expect(tableBounds!.x - editorBounds!.x).toBeGreaterThanOrEqual(80);
  await page.screenshot({
    path: testInfo.outputPath('deep-relation-padding.png'),
    fullPage: true,
  });
});

test('visual error and read-only scenarios retain their distinct UI states', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--error-state&viewMode=story',
  );
  await expect(page.getByRole('alert')).toContainText(
    "unresolved reference 'a'",
  );

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--loan-origination-overview-read-only&viewMode=story',
  );
  await expect(page.getByRole('treegrid')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add field to *' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Edit signature creditScore' }),
  ).toHaveCount(0);
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('visual nested-function and large-model scenarios keep rendering static', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--nested-function-visual&viewMode=story',
  );
  await page.getByRole('button', { name: 'Expand application' }).click();
  await expect(
    page.getByText('func affordability(income: number)'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Expand application.affordability' })
    .click();
  await expect(
    page.getByRole('row', { name: 'application.affordability.threshold' }),
  ).toContainText('monthlyIncome * 0.35');
  await expect(page.locator('.cm-editor')).toHaveCount(0);

  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--large-model-visual&viewMode=story',
  );
  await expect(page.getByRole('row', { name: 'value0' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'value199' })).toBeVisible();
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('Project Explorer root paths and specialized boxed links route to their host editors', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=boxed-editor-boxededitor--project-explorer-integration&viewMode=story',
  );
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText(
    'boxed: *',
  );

  await page.getByText('monthly()', { exact: true }).click();
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText(
    'boxed: monthly',
  );

  await page.getByText('Variables', { exact: true }).click();
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText(
    'boxed: *',
  );
  await page.getByRole('button', { name: 'Open Types Editor' }).click();
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText(
    'type-definition: Applicant',
  );

  await page.getByText('Variables', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Open Decision Table Editor' })
    .click();
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText(
    'ruleset: risk',
  );
  await expect(page.locator('table.MuiTable-root')).toBeVisible();

  await page.getByText('Variables', { exact: true }).click();
  await page.getByRole('button', { name: 'Open Loop Editor' }).click();
  await expect(page.getByTestId('boxed-workspace-route')).toHaveText(
    'loop: counter',
  );
  await expect(page.getByRole('alert')).toContainText(
    'Loop Editor route: counter',
  );
});
