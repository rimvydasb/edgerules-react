import 'fake-indexeddb/auto';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('TestsManager execution', () => {
  it('committing an input edit runs the case and shows the computed value', async () => {
    const user = userEvent.setup();
    const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
    render(<TestsManager service={service} modelName={uniqueModelName()} />);

    await waitFor(() =>
      expect(screen.getByLabelText('input age')).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText('input age'), '30');
    await user.type(screen.getByLabelText('input credit.balance'), '1000');
    await user.click(document.body);

    await waitFor(() =>
      expect(screen.getByTestId('validation-maxLimit')).toHaveTextContent(
        '10000',
      ),
    );
  });

  it('highlights a mismatched assertion in red with the actual value in its tooltip', async () => {
    const user = userEvent.setup();
    const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
    render(<TestsManager service={service} modelName={uniqueModelName()} />);

    await waitFor(() =>
      expect(screen.getByLabelText('input age')).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText('input age'), '10'); // under 18 -> not approved
    await user.type(screen.getByLabelText('input credit.balance'), '1000');
    await user.click(document.body);
    await waitFor(() =>
      expect(
        screen.getByTestId('validation-creditDecision.approved'),
      ).toHaveTextContent('false'),
    );

    // Promote the computed row to an assertion, seeded from the row menu's "Move to Assertions".
    await user.click(screen.getByLabelText('row menu creditDecision.approved'));
    await user.click(
      screen.getByRole('menuitem', { name: 'Move to Assertions' }),
    );

    await waitFor(() =>
      expect(
        screen.getByLabelText('assertion creditDecision.approved'),
      ).toBeInTheDocument(),
    );
    const assertionField = screen.getByLabelText(
      'assertion creditDecision.approved',
    ) as HTMLInputElement;
    expect(assertionField.value).toBe('false');

    await user.clear(assertionField);
    await user.type(assertionField, 'true');
    await user.click(document.body);

    await waitFor(() =>
      expect(assertionField).toHaveAttribute('data-mismatch', 'true'),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId(/^assertion-summary-/)[0]).toHaveTextContent(
        '0/1',
      ),
    );
  });
});
