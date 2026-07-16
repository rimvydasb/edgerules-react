import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { BoxedEditor } from '../BoxedEditor';

const MODEL = `{
  type Applicant: { age: <number> }
  application: { amount: <number, required: true> nested: { score: amount * 2 } }
  func monthly(amount: number) -> number: amount / 12
  external func lookup(id: string) -> string
  payment: monthly(application.amount)
}`;

function service() { return MutableDecisionService.fromCode(MODEL); }

describe('BoxedEditor', () => {
  it('renders root fields in authored order with static expression text and inferred labels', () => {
    render(<BoxedEditor service={service()} path="*" readOnly />);
    expect(screen.getByRole('treegrid')).toBeInTheDocument();
    expect(screen.getByText('Applicant')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'application' })).toBeInTheDocument();
    expect(screen.getByText('func monthly(amount: number) → number')).toBeInTheDocument();
    expect(screen.getByText('external func lookup(id: string) → string')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'payment' })).toHaveTextContent('monthly(application.amount)');
    expect(screen.getByText('number')).toBeInTheDocument();
  });

  it('supports expanding and collapsing nested contexts', async () => {
    const user = userEvent.setup();
    render(<BoxedEditor service={service()} path="*" readOnly />);
    expect(screen.queryByRole('row', { name: 'application.amount' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand application' }));
    expect(screen.getByRole('row', { name: 'application.amount' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse application' }));
    expect(screen.queryByRole('row', { name: 'application.amount' })).not.toBeInTheDocument();
  });

  it('focuses a selected authored path and maps function bodies from CRUD paths', () => {
    render(<BoxedEditor service={service()} path="monthly" readOnly />);
    expect(screen.getByText('func monthly(amount: number) → number')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'monthly.result' })).toHaveTextContent('amount / 12');
  });

  it('routes specialized definitions while read-only', async () => {
    const onOpenNode = vi.fn();
    const user = userEvent.setup();
    render(<BoxedEditor service={service()} path="*" readOnly onOpenNode={onOpenNode} />);
    await user.click(screen.getByRole('button', { name: 'Open Types Editor' }));
    expect(onOpenNode).toHaveBeenCalledWith({ path: 'Applicant', kind: 'type-definition' });
  });
});
