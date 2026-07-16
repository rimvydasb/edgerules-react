import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('maps context-function body fields to their CRUD paths', () => {
    const instance = MutableDecisionService.fromCode(`{
      func summary(amount: number): {
        tax: amount * 0.2
        result: amount + tax
      }
    }`);
    render(<BoxedEditor service={instance} path="summary" readOnly />);
    expect(screen.getByRole('row', { name: 'summary.tax' })).toHaveTextContent('amount * 0.2');
    expect(screen.getByRole('row', { name: 'summary.result' })).toHaveTextContent('amount + tax');
  });

  it('routes specialized definitions while read-only', async () => {
    const onOpenNode = vi.fn();
    const user = userEvent.setup();
    render(<BoxedEditor service={service()} path="*" readOnly onOpenNode={onOpenNode} />);
    await user.click(screen.getByRole('button', { name: 'Open Types Editor' }));
    expect(onOpenNode).toHaveBeenCalledWith({ path: 'Applicant', kind: 'type-definition' });
  });

  it('commits an expression through one active CodeEditorCell and emits the refreshed snapshot', async () => {
    const user = userEvent.setup();
    const instance = MutableDecisionService.fromCode('{ answer: 1 }');
    const onChange = vi.fn();
    const { container } = render(<BoxedEditor service={instance} path="*" onChange={onChange} />);

    await user.click(within(screen.getByRole('row', { name: 'answer' })).getAllByRole('cell')[2]);
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(1);
    const editor = container.querySelector<HTMLElement>('.cm-content');
    expect(editor).not.toBeNull();
    await user.click(editor!);
    await user.keyboard('{Control>}a{/Control}1 + 2{Enter}');

    expect(instance.toPortable().answer).toMatchObject({ '@kind': 'expression', expression: '1 + 2' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(0);
  });

  it('writes complete typed inputs and supports context add, rename, duplicate, and delete', async () => {
    const user = userEvent.setup();
    const instance = service();
    render(<BoxedEditor service={instance} path="*" />);

    await user.click(screen.getByRole('button', { name: 'Expand application' }));
    await user.click(screen.getByRole('button', { name: '<number, required>' }));
    const inputDialog = screen.getByRole('dialog');
    await user.click(within(inputDialog).getByLabelText('Required'));
    await user.click(within(inputDialog).getByRole('button', { name: 'Save input' }));
    expect(instance.toPortable().application as object).toMatchObject({ amount: { '@kind': 'type', type: 'number' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add field to application' }));
    const addDialog = screen.getByRole('dialog');
    await user.type(within(addDialog).getByLabelText('Name'), 'fee');
    await user.click(within(addDialog).getByRole('button', { name: 'Add field' }));
    expect(instance.toPortable().application as object).toHaveProperty('fee', 0);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Rename application.fee' }));
    const name = screen.getByLabelText('Name application.fee');
    await user.clear(name);
    await user.type(name, 'serviceFee');
    await user.keyboard('{Enter}');
    expect(instance.toPortable().application as object).toHaveProperty('serviceFee', 0);

    await user.click(screen.getByRole('button', { name: 'Duplicate application.serviceFee' }));
    expect(instance.toPortable().application as object).toHaveProperty('serviceFeeCopy', 0);
    await user.click(screen.getByRole('button', { name: 'Delete application.serviceFeeCopy' }));
    expect(instance.toPortable().application as object).not.toHaveProperty('serviceFeeCopy');
  });

  it('removes all mutation affordances in read-only mode', () => {
    render(<BoxedEditor service={service()} path="*" readOnly />);
    expect(screen.queryByRole('button', { name: 'Edit payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add field to *' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename payment' })).not.toBeInTheDocument();
  });

  it('rolls back a rename when linked validation exposes an unresolved reference', async () => {
    const user = userEvent.setup();
    const instance = service();
    const onChange = vi.fn();
    render(<BoxedEditor service={instance} path="*" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Expand application' }));
    await user.click(screen.getByRole('button', { name: 'Rename application.amount' }));
    const name = screen.getByLabelText('Name application.amount');
    await user.clear(name);
    await user.type(name, 'principal');
    await user.keyboard('{Enter}');

    expect(instance.toPortable().application as object).toHaveProperty('amount');
    expect(instance.toPortable().application as object).not.toHaveProperty('principal');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/unresolved reference 'amount'/)).toBeInTheDocument();
  });

  it('writes complete function and external signatures and preserves function bodies', async () => {
    const user = userEvent.setup();
    const instance = MutableDecisionService.fromCode(`{
      func monthly(amount: number): amount / 12
      external func lookup(id: string) -> string
    }`);
    render(<BoxedEditor service={instance} path="*" />);

    await user.click(screen.getByRole('button', { name: 'Edit signature monthly' }));
    const functionDialog = screen.getByRole('dialog');
    await user.click(within(functionDialog).getByRole('button', { name: 'Add parameter' }));
    await user.type(within(functionDialog).getByLabelText('Parameter 2 name'), 'fee');
    await user.click(within(functionDialog).getByRole('button', { name: 'Save signature' }));
    expect(instance.toPortable().monthly).toMatchObject({
      '@kind': 'function',
      '@parameters': { amount: 'number', fee: 'number' },
      '@body': { '@kind': 'expression', expression: 'amount / 12' },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit signature lookup' }));
    const externalDialog = screen.getByRole('dialog');
    await user.clear(within(externalDialog).getByLabelText('Return type'));
    await user.type(within(externalDialog).getByLabelText('Return type'), 'number');
    await user.click(within(externalDialog).getByRole('button', { name: 'Save signature' }));
    expect(instance.toPortable().lookup).toMatchObject({
      '@kind': 'external-function',
      '@parameters': { id: 'string' },
      '@return': 'number',
    });
  });

  it('expands invocation arguments, writes complete invocations, and writes modeler metadata', async () => {
    const user = userEvent.setup();
    const instance = service();
    instance.set('payment', { '@kind': 'invocation', '@method': 'monthly', '@arguments': ['application.amount'] });
    const { container } = render(<BoxedEditor service={instance} path="*" />);

    await user.click(screen.getByRole('button', { name: 'Expand payment' }));
    const argumentRow = screen.getByRole('row', { name: 'payment.@arguments[0]' });
    expect(argumentRow).toHaveTextContent('application.amount');
    await user.click(within(argumentRow).getAllByRole('cell')[2]);
    const editor = container.querySelector<HTMLElement>('.cm-content');
    expect(editor).not.toBeNull();
    await user.click(editor!);
    await user.keyboard('{Control>}a{/Control}application.amount * 3{Enter}');
    expect(instance.toPortable().payment).toMatchObject({ '@arguments': ['application.amount * 3'] });
    await user.click(screen.getByRole('button', { name: 'Edit invocation payment' }));
    const invocationDialog = screen.getByRole('dialog');
    await user.clear(within(invocationDialog).getByLabelText('Argument 1 expression'));
    await user.type(within(invocationDialog).getByLabelText('Argument 1 expression'), 'application.amount * 2');
    await user.click(within(invocationDialog).getByRole('button', { name: 'Save invocation' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(instance.toPortable().payment).toMatchObject({
      '@kind': 'invocation', '@method': 'monthly', '@arguments': ['application.amount * 2'],
    });

    await user.click(screen.getByRole('button', { name: 'Edit metadata application' }));
    const metadataDialog = screen.getByRole('dialog');
    await user.type(within(metadataDialog).getByLabelText('Node kind'), 'ChartNode');
    await user.type(within(metadataDialog).getByLabelText('Node label'), 'Application');
    await user.type(within(metadataDialog).getByLabelText('Description'), 'Loan inputs');
    await user.click(within(metadataDialog).getByRole('button', { name: 'Save metadata' }));
    expect(instance.toPortable().application).toMatchObject({
      '@node': 'ChartNode', '@node-name': 'Application',
    });
  });
});
