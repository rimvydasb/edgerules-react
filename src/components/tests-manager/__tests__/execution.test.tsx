import 'fake-indexeddb/auto';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';
import {TestsManager} from '../TestsManager';

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

        await waitFor(() => expect(screen.getByLabelText('input age')).toBeInTheDocument());
        await user.type(screen.getByLabelText('input age'), '30');
        await user.type(screen.getByLabelText('input credit.balance'), '1000');
        await user.click(document.body);

        await waitFor(() => expect(screen.getByTestId('validation-maxLimit')).toHaveTextContent('10000'));
    });

    it('highlights a mismatched assertion in red with the actual value in its tooltip', async () => {
        const user = userEvent.setup();
        const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
        render(<TestsManager service={service} modelName={uniqueModelName()} />);

        await waitFor(() => expect(screen.getByLabelText('input age')).toBeInTheDocument());
        await user.type(screen.getByLabelText('input age'), '10'); // under 18 -> not approved
        await user.type(screen.getByLabelText('input credit.balance'), '1000');
        await user.click(document.body);
        await waitFor(() =>
            expect(screen.getByTestId('validation-creditDecision.approved')).toHaveTextContent('false'),
        );

        // Promote the computed row to an assertion, seeded from the row menu's "Move to Assertions".
        await user.click(screen.getByLabelText('row menu creditDecision.approved'));
        await user.click(screen.getByRole('menuitem', {name: 'Move to Assertions'}));

        await waitFor(() => expect(screen.getByLabelText('assertion creditDecision.approved')).toBeInTheDocument());
        const assertionField = screen.getByLabelText('assertion creditDecision.approved') as HTMLInputElement;
        expect(assertionField.value).toBe('false');

        await user.clear(assertionField);
        await user.type(assertionField, 'true');
        await user.click(document.body);

        await waitFor(() => expect(assertionField).toHaveAttribute('data-mismatch', 'true'));
        await waitFor(() => expect(screen.getAllByTestId(/^assertion-summary-/)[0]).toHaveTextContent('0/1'));
    });

    it("excludes a since-deleted row's leftover assertion from the section pass-count", async () => {
        const user = userEvent.setup();
        const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
        service.set('bonus', {'@kind': 'expression', expression: '5'});
        const modelName = uniqueModelName();
        const {rerender} = render(<TestsManager service={service} modelName={modelName} revision={1} />);

        await waitFor(() => expect(screen.getByTestId('row-bonus')).toBeInTheDocument());
        await user.click(screen.getByLabelText('row menu bonus'));
        await user.click(screen.getByRole('menuitem', {name: 'Move to Assertions'}));
        await waitFor(() => expect(screen.getByLabelText('assertion bonus')).toBeInTheDocument());
        await user.type(screen.getByLabelText('assertion bonus'), '5');
        await user.click(document.body);
        await user.click(screen.getByRole('button', {name: 'Run all'}));

        await waitFor(() => expect(screen.getAllByTestId(/^assertion-summary-/)[0]).toHaveTextContent('1/1'));

        service.remove('bonus');
        rerender(<TestsManager service={service} modelName={modelName} revision={2} />);

        await waitFor(() => expect(screen.getByLabelText('deleted bonus')).toBeInTheDocument());
        // 'bonus' can never be satisfied again — its leftover assertion drops out of the count
        // entirely (no ratio shown) rather than scoring as a pass or a fail.
        await waitFor(() => expect(screen.getAllByTestId(/^assertion-summary-/)[0]).toHaveTextContent(''));
    });
});

describe('TestsManager row menu content', () => {
    it('disables the row menu for an input row — no row action applies to inputs', async () => {
        const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
        render(<TestsManager service={service} modelName={uniqueModelName()} />);

        await waitFor(() => expect(screen.getByLabelText('row menu age')).toBeInTheDocument());
        expect(screen.getByLabelText('row menu age')).toBeDisabled();
    });

    it('a validations-section row menu offers Move to Assertions', async () => {
        const user = userEvent.setup();
        const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
        render(<TestsManager service={service} modelName={uniqueModelName()} />);

        await waitFor(() => expect(screen.getByLabelText('row menu creditDecision.approved')).toBeInTheDocument());
        await user.click(screen.getByLabelText('row menu creditDecision.approved'));

        expect(screen.getByRole('menuitem', {name: 'Move to Assertions'})).toBeInTheDocument();
    });

    it('a promoted assertions-section row menu offers Delete and Copy actual to expected', async () => {
        const user = userEvent.setup();
        const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
        render(<TestsManager service={service} modelName={uniqueModelName()} />);

        await waitFor(() => expect(screen.getByLabelText('row menu creditDecision.approved')).toBeInTheDocument());
        await user.click(screen.getByLabelText('row menu creditDecision.approved'));
        await user.click(screen.getByRole('menuitem', {name: 'Move to Assertions'}));

        await waitFor(() => expect(screen.getByLabelText('row menu creditDecision.approved')).not.toBeDisabled());
        await user.click(screen.getByLabelText('row menu creditDecision.approved'));

        expect(screen.getByRole('menuitem', {name: 'Delete'})).toBeInTheDocument();
        expect(screen.getByRole('menuitem', {name: 'Copy actual to expected'})).toBeInTheDocument();
        expect(screen.queryByRole('menuitem', {name: 'Move to Validations'})).not.toBeInTheDocument();
    });
});
