import 'fake-indexeddb/auto';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TestsManager } from '../TestsManager';
import type { MutableDecisionService as RunnerService } from '../tests-manager-types';

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

const MULTI_SUBJECT_MODEL = `{
    func isEligible(age: number): age >= 18
    ruleset risk(age: number): {
        hitPolicy: "first-match"
        rules: [ { when: { age: 18..25 }, then: { level: "high" } } ]
        default: { level: "none" }
    }
}`;

function buildService(code: string): RunnerService {
  return MutableDecisionService.fromCode(code) as unknown as RunnerService;
}

describe('TestsManager — rendering', () => {
  it('renders the model subject with its inputs and validations sections and a first test case', async () => {
    const service = buildService(WORKBOOK_MODEL);
    render(<TestsManager service={service} modelName={uniqueModelName()} />);

    await waitFor(() =>
      expect(screen.getByTestId('row-name')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('row-age')).toBeInTheDocument();
    expect(screen.getByTestId('row-credit.balance')).toBeInTheDocument();
    expect(screen.getByTestId('row-maxLimit')).toBeInTheDocument();
    expect(
      screen.getByTestId('row-creditDecision.approved'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('section-inputs')).toBeInTheDocument();
    expect(screen.getByTestId('section-assertions')).toBeInTheDocument();
    expect(screen.getByTestId('section-validations')).toBeInTheDocument();
    expect(screen.getAllByText('Test Case 1').length).toBeGreaterThan(0);
  });

  it('switches subjects through the Path column drop-down and re-derives rows', async () => {
    const user = userEvent.setup();
    const service = buildService(MULTI_SUBJECT_MODEL);
    render(<TestsManager service={service} modelName={uniqueModelName()} />);

    await waitFor(() =>
      expect(screen.getByLabelText('Test subject')).toBeInTheDocument(),
    );
    await user.click(screen.getByLabelText('Test subject'));
    await user.click(screen.getByRole('option', { name: 'risk' }));

    await waitFor(() =>
      expect(screen.getByTestId('row-age')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('row-level')).toBeInTheDocument();
  });

  it('fires onSubjectChange when controlled', async () => {
    const user = userEvent.setup();
    const service = buildService(MULTI_SUBJECT_MODEL);
    const onSubjectChange = vi.fn();
    render(
      <TestsManager
        service={service}
        modelName={uniqueModelName()}
        subjectId="*"
        onSubjectChange={onSubjectChange}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Test subject')).toBeInTheDocument(),
    );
    await user.click(screen.getByLabelText('Test subject'));
    await user.click(screen.getByRole('option', { name: 'isEligible' }));

    expect(onSubjectChange).toHaveBeenCalledWith('isEligible');
  });

  it('pages test-case columns once there are more than pageSize', async () => {
    const service = buildService(WORKBOOK_MODEL);
    render(
      <TestsManager
        service={service}
        modelName={uniqueModelName()}
        pageSize={2}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('tests-grid')).toBeInTheDocument(),
    );
    // Add cases via the toolbar button until paging kicks in.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add test case' }));
    await user.click(screen.getByRole('button', { name: 'Add test case' }));

    await waitFor(() =>
      expect(screen.getByTestId('page-indicator')).toHaveTextContent(
        'Page 1/2',
      ),
    );
  });

  it('disables editing and case CRUD in readOnly mode while running stays available', async () => {
    const service = buildService(WORKBOOK_MODEL);
    render(
      <TestsManager service={service} modelName={uniqueModelName()} readOnly />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('row-age')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Add test case' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Run all' })).toBeEnabled();
    const inputs = screen.getAllByLabelText('input age');
    expect(inputs[0]).toBeDisabled();
  });
});
