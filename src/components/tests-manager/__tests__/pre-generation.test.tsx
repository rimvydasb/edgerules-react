import 'fake-indexeddb/auto';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TestsManager } from '../TestsManager';

function uniqueModelName(): string {
  return `model-${Math.random().toString(36).slice(2)}`;
}

const WORKBOOK_MODEL = `{
    maxLimit: 10000,
    name: <string, required: true>,
    age: <number, required: true>,
    credit: {
        balance: <number, required: true>,
        limit: <number, required: true>
    },
    creditDecision: {
        approved: if credit.balance >= 0 and age > 17 then true else false,
        limit: if approved then maxLimit else 0
    }
}`;

describe('TestsManager pre-generation', () => {
  it('derives rows and creates a first test case on first run, so the grid is never empty', async () => {
    const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
    render(<TestsManager service={service} modelName={uniqueModelName()} />);

    await waitFor(() =>
      expect(screen.getByTestId('row-age')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('row-maxLimit')).toBeInTheDocument();
    expect(screen.getAllByText('Test Case 1').length).toBeGreaterThan(0);
  });

  it('appends a newly declared field to Validations on a revision bump', async () => {
    const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
    const modelName = uniqueModelName();
    const { rerender } = render(
      <TestsManager service={service} modelName={modelName} revision={1} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('row-age')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('row-bonus')).toBeNull();

    service.set('bonus', { '@kind': 'expression', expression: '5' });
    rerender(
      <TestsManager service={service} modelName={modelName} revision={2} />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('row-bonus')).toBeInTheDocument(),
    );
    const validations = screen.getByTestId('section-validations');
    expect(
      validations.compareDocumentPosition(screen.getByTestId('row-bonus')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // Existing rows are untouched by the reconciliation.
    expect(screen.getByTestId('row-age')).toBeInTheDocument();
  });

  it('hides a field the model no longer declares, without discarding its test data', async () => {
    const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
    const modelName = uniqueModelName();
    service.set('bonus', { '@kind': 'expression', expression: '5' });
    const { rerender } = render(
      <TestsManager service={service} modelName={modelName} revision={1} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('row-bonus')).toBeInTheDocument(),
    );

    service.remove('bonus');
    rerender(
      <TestsManager service={service} modelName={modelName} revision={2} />,
    );

    await waitFor(() => expect(screen.queryByTestId('row-bonus')).toBeNull());
    // Restoring the field would restore its row from the same persisted (present: false) entry —
    // covered at the TestCasesService level by createTestCasesService.test.ts's syncRows tests.
  });
});
