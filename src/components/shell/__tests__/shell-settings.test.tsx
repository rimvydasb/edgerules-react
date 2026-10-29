import 'fake-indexeddb/auto';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';
import {ProjectProvider, type ProjectSession} from '../../project-session';
import {openFixtureProject} from '../../project-session/testing/sessionFixture';
import {Shell} from '../Shell';
import type {ShellProps} from '../shell-types';

// A model with a workbook of an input node and a function node, and a plain context.
const MODEL = `{
    func riskScore(income: number): { score: income / 100 }
    applicant: { income: 5000 }
    @Workbook(name: "Loan book")
    loanBook: {
        @InputNode
        input: { income: 5000 }
        @FunctionNode
        decision: riskScore(income: input.income)
    }
    @Workbook
    otherBook: {
        @InputNode
        input: { income: 100 }
    }
}`;

async function renderShell(props: Partial<ShellProps> = {}, name?: string) {
    const {session} = await openFixtureProject({model: {dsl: MODEL, name, version: name && '1.0.0'}});
    render(
        <ProjectProvider session={session}>
            <div style={{width: 1000, height: 700}}>
                <Shell languageService={MutableDecisionService} {...props} />
            </div>
        </ProjectProvider>,
    );
    return session;
}

function rootCrumb(): HTMLElement {
    return within(screen.getByRole('navigation', {name: 'Model path'})).getAllByRole('button')[0]!;
}

async function saveSettings(user: ReturnType<typeof userEvent.setup>, values: Record<string, string>) {
    const dialog = await screen.findByRole('dialog');
    for (const [label, value] of Object.entries(values)) {
        const field = within(dialog).getByLabelText(label, {exact: false});
        await user.clear(field);
        if (value !== '') await user.type(field, value);
    }
    await user.click(within(dialog).getByRole('button', {name: 'Save'}));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

function workbookLine(session: ProjectSession, field: string): string | undefined {
    return session.engine
        .exportDsl()
        .split('\n')
        .map((line, index, lines) => (lines[index + 1]?.trim().startsWith(`${field}:`) ? line.trim() : undefined))
        .find((line) => line !== undefined);
}

describe('Shell settings', () => {
    it('shows the model name as the first breadcrumb', async () => {
        await renderShell({defaultPath: 'loanBook'}, 'Loan desk');
        expect(rootCrumb()).toHaveTextContent('Loan desk');
    });

    it('renames the model and sets its version and description', async () => {
        const user = userEvent.setup();
        const session = await renderShell();
        expect(screen.getByTestId('row-*').querySelector('[role="heading"]')).toHaveTextContent('Model');

        await user.click(screen.getByRole('button', {name: 'Model settings'}));
        const dialog = await screen.findByRole('dialog', {name: 'Model settings'});
        expect(within(dialog).getByLabelText('Name', {exact: false})).toHaveValue('');
        await saveSettings(user, {Name: 'Risk desk', Version: '2.1.0', Description: 'Scores loans'});

        expect(session.getSlice('model').metadata).toEqual({name: 'Risk desk', version: '2.1.0'});
        expect(session.engine.toPortable()).toMatchObject({'@model-name': 'Risk desk', '@model-version': '2.1.0'});
        expect(session.documentation.getDescription('*')).toBe('Scores loans');
        expect(session.exportBundle().manifest.model).toMatchObject({name: 'Risk desk', version: '2.1.0'});
        expect(screen.getByTestId('row-*').querySelector('[role="heading"]')).toHaveTextContent('Risk desk');
        expect(screen.getByText('Risk desk', {selector: '[aria-current]'})).toBeInTheDocument();
    });

    it('opens with the current values and changes nothing on Cancel', async () => {
        const user = userEvent.setup();
        const session = await renderShell({}, 'Loan desk');
        const before = session.getSnapshot().localVersion;

        await user.click(screen.getByRole('button', {name: 'Model settings'}));
        const dialog = await screen.findByRole('dialog', {name: 'Model settings'});
        expect(within(dialog).getByLabelText('Name', {exact: false})).toHaveValue('Loan desk');
        expect(within(dialog).getByLabelText('Version', {exact: false})).toHaveValue('1.0.0');
        await user.type(within(dialog).getByLabelText('Name', {exact: false}), ' 2');
        await user.click(within(dialog).getByRole('button', {name: 'Cancel'}));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(session.getSlice('model').metadata.name).toBe('Loan desk');
        expect(session.getSnapshot().localVersion).toBe(before);
    });

    it('renames a workbook through the name of its annotation, without a version field', async () => {
        const user = userEvent.setup();
        const session = await renderShell({defaultPath: 'loanBook'});

        await user.click(screen.getByRole('button', {name: 'Workbook settings'}));
        const dialog = await screen.findByRole('dialog', {name: 'Workbook settings'});
        expect(within(dialog).getByLabelText('Name', {exact: false})).toHaveValue('Loan book');
        expect(within(dialog).queryByLabelText('Version', {exact: false})).not.toBeInTheDocument();
        await saveSettings(user, {Name: 'Mortgage book', Description: 'The mortgages'});

        expect(workbookLine(session, 'loanBook')).toBe('@Workbook(name: "Mortgage book")');
        expect(session.documentation.getDescription('loanBook')).toBe('The mortgages');
        // The field keeps its name and its nodes.
        expect(session.engine.toPortable()).toMatchObject({loanBook: {'@node-name': 'Mortgage book', input: {}}});
    });

    it('names an unnamed workbook, and an empty name removes the annotation name', async () => {
        const user = userEvent.setup();
        const session = await renderShell({defaultPath: 'otherBook'});

        await user.click(screen.getByRole('button', {name: 'Workbook settings'}));
        await saveSettings(user, {Name: 'Other'});
        expect(workbookLine(session, 'otherBook')).toBe('@Workbook(name: "Other")');

        await user.click(screen.getByRole('button', {name: 'Workbook settings'}));
        await saveSettings(user, {Name: ''});
        expect(workbookLine(session, 'otherBook')).toBe('@Workbook');
    });

    it('offers the settings of an annotated node', async () => {
        await renderShell({defaultPath: 'loanBook.input'});
        expect(screen.getByRole('button', {name: 'InputNode settings'})).toBeInTheDocument();
    });

    it('offers no settings for a plain context', async () => {
        await renderShell({defaultPath: 'applicant'});
        expect(screen.queryByTestId('shell-settings')).not.toBeInTheDocument();
    });

    it('offers no settings when read-only', async () => {
        await renderShell({readOnly: true});
        expect(screen.queryByTestId('shell-settings')).not.toBeInTheDocument();
    });
});

describe('Shell workbook picker', () => {
    it('shows the annotation name, the field name, the description and the node counts of every workbook', async () => {
        const user = userEvent.setup();
        const session = await renderShell({defaultView: 'flow'});
        session.documentation.setDescription('loanBook', 'Every loan of the desk');

        const loanBook = await screen.findByTestId('shell-workbook-loanBook');
        expect(loanBook).toHaveAccessibleName('Loan book');
        expect(loanBook).toHaveTextContent('loanBook');
        expect(await within(loanBook).findByText('Every loan of the desk')).toBeInTheDocument();
        expect(loanBook).toHaveTextContent('1 input · 1 function');

        const otherBook = screen.getByTestId('shell-workbook-otherBook');
        expect(otherBook).toHaveAccessibleName('otherBook');
        expect(otherBook).toHaveTextContent('No description');
        expect(otherBook).toHaveTextContent('1 input · 0 functions');

        // A description edited in the settings shows on the panel.
        await user.click(screen.getByRole('button', {name: 'Model settings'}));
        await saveSettings(user, {Description: 'The desk'});
        await user.click(loanBook);
        await user.click(screen.getByRole('button', {name: 'Workbook settings'}));
        await saveSettings(user, {Description: 'Renamed description'});
        await user.click(rootCrumb());
        expect(await screen.findByText('Renamed description')).toBeInTheDocument();
    });
});
