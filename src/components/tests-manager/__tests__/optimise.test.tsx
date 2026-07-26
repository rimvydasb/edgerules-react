import 'fake-indexeddb/auto';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TestsManager } from '../TestsManager';

function uniqueModelName(): string {
  return `model-${Math.random().toString(36).slice(2)}`;
}

const OPTIMISE_MODEL = `{
    optimise factoryProduction(workers: number, sticks: number, plates: number): {
        bottlenecks: true
        variables: {
            chairs: <number, integer: true, min: 0>
            tables: <number, integer: true, min: 0>
        }
        maximise: 15 * chairs + 40 * tables
        constraints: {
            workerCapacity: 1 * chairs + 3 * tables <= workers
            stickSupply: 4 * chairs + 4 * tables <= sticks
            plateSupply: 1 * chairs + 2 * tables <= plates
        }
    }
}`;

describe('TestsManager — optimise subject', () => {
  it('runs end to end through a registered solver', async () => {
    const user = userEvent.setup();
    const service = MutableDecisionService.fromCode(OPTIMISE_MODEL);
    service.registerSolver(
      () => ({
        status: 'optimal',
        objective: 120,
        values: { chairs: 8, tables: 0 },
      }),
      { name: 'stub', version: '1.0' },
    );

    render(
      <TestsManager
        service={service}
        modelName={uniqueModelName()}
        subjectId="factoryProduction"
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('input workers')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('missing-solver-banner')).toBeNull();

    await user.type(screen.getByLabelText('input workers'), '8');
    await user.type(screen.getByLabelText('input sticks'), '40');
    await user.type(screen.getByLabelText('input plates'), '12');
    await user.click(document.body);

    await waitFor(() =>
      expect(screen.getByTestId('validation-status')).toHaveTextContent(
        'optimal',
      ),
    );
    expect(screen.getByTestId('validation-objective')).toHaveTextContent('120');
    expect(screen.getByTestId('validation-chairs')).toHaveTextContent('8');
    expect(screen.getByTestId('validation-solver')).toHaveTextContent(
      'stub 1.0',
    );
  });

  it('shows the missing-solver pre-flight banner when no solver is registered', async () => {
    const service = MutableDecisionService.fromCode(OPTIMISE_MODEL);
    render(
      <TestsManager
        service={service}
        modelName={uniqueModelName()}
        subjectId="factoryProduction"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('missing-solver-banner')).toBeInTheDocument(),
    );
  });
});
