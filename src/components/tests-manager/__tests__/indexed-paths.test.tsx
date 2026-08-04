import 'fake-indexeddb/auto';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {currentCompletions, startCompletion} from '@codemirror/autocomplete';
import {EditorView} from '@codemirror/view';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';
import {TestsManager} from '../TestsManager';

function uniqueModelName(): string {
    return `model-${Math.random().toString(36).slice(2)}`;
}

const ARRAY_MODEL = `{
    type CreditLine: { balance: <number>, limit: <number> }
    type Applicant: { name: <string>, creditLine: <CreditLine[]> }
    application: { applicant: <Applicant[]> }
    totals: { first: application.applicant[0].creditLine[0].balance }
}`;

function renderArrayModel(): {user: ReturnType<typeof userEvent.setup>} {
    const user = userEvent.setup();
    const service = MutableDecisionService.fromCode(ARRAY_MODEL);
    render(<TestsManager service={service} modelName={uniqueModelName()} />);
    return {user};
}

async function pathEditorView(editorTestId: string): Promise<EditorView> {
    const editor = await screen.findByTestId(editorTestId);
    const view = EditorView.findFromDOM(editor.querySelector('.cm-editor') as HTMLElement);
    if (!view) throw new Error('Could not find the CodeMirror view');
    return view;
}

// Replaces the Path editor's whole document. Driven through CodeMirror's own transaction API
// rather than synthetic keystrokes — the same technique the `CodeEditorCell` tests use, since
// jsdom has no real text-input handling for a contenteditable.
async function retypePath(editorTestId: string, text: string): Promise<HTMLElement> {
    const view = await pathEditorView(editorTestId);
    view.dispatch({
        changes: {from: 0, to: view.state.doc.length, insert: text},
        selection: {anchor: text.length},
    });
    return screen.getByTestId(editorTestId).querySelector('.cm-content') as HTMLElement;
}

describe('TestsManager — pre-generated indexed paths', () => {
    it('pre-generates the zero-indexed element of every array, at every depth', async () => {
        renderArrayModel();

        await waitFor(() => expect(screen.getByTestId('row-application.applicant')).toBeInTheDocument());
        expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument();
        expect(screen.getByTestId('row-application.applicant[0].creditLine[0].balance')).toBeInTheDocument();
        expect(screen.getByTestId('row-application.applicant[0].creditLine[0].limit')).toBeInTheDocument();
    });

    it('duplicates an indexed row into the next free element, right below its source', async () => {
        const {user} = renderArrayModel();
        await waitFor(() => expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument());

        await user.click(screen.getByLabelText('row menu application.applicant[0].name'));
        await user.click(screen.getByRole('menuitem', {name: 'Duplicate'}));

        const copy = await screen.findByTestId('row-application.applicant[1].name');
        expect(screen.getByTestId('row-application.applicant[0].name').compareDocumentPosition(copy)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
        expect(screen.getByLabelText('input application.applicant[1].name')).toBeInTheDocument();
    });

    it('offers no Duplicate for a row that addresses no array element', async () => {
        const {user} = renderArrayModel();
        await waitFor(() => expect(screen.getByTestId('row-application.applicant')).toBeInTheDocument());

        await user.click(screen.getByLabelText('row menu application.applicant'));
        expect(screen.queryByRole('menuitem', {name: 'Duplicate'})).toBeNull();
    });

    it('deletes a duplicated row outright, leaving the derived one alone', async () => {
        const {user} = renderArrayModel();
        await waitFor(() => expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument());
        await user.click(screen.getByLabelText('row menu application.applicant[0].name'));
        await user.click(screen.getByRole('menuitem', {name: 'Duplicate'}));
        await screen.findByTestId('row-application.applicant[1].name');

        await user.click(screen.getByLabelText('row menu application.applicant[1].name'));
        await user.click(screen.getByRole('menuitem', {name: 'Delete row'}));

        await waitFor(() => expect(screen.queryByTestId('row-application.applicant[1].name')).toBeNull());
        expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument();
    });
});

describe('TestsManager — editing a path', () => {
    it('opens an editor on click and repoints the row on commit, carrying its input value', async () => {
        const {user} = renderArrayModel();
        await waitFor(() => expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument());
        await user.type(screen.getByLabelText('input application.applicant[0].name'), 'Ann');
        await user.click(document.body);

        await user.click(screen.getByLabelText('path application.applicant[0].name'));
        const content = await retypePath('path-editor-application.applicant[0].name', 'application.applicant[3].name');
        await user.click(content);
        await user.keyboard('{Enter}');

        await waitFor(() => expect(screen.getByTestId('row-application.applicant[3].name')).toBeInTheDocument());
        expect((screen.getByLabelText('input application.applicant[3].name') as HTMLInputElement).value).toBe('Ann');
        expect(screen.queryByTestId('row-application.applicant[0].name')).toBeNull();
    });

    it('marks a path the model does not declare while it is being typed', async () => {
        const {user} = renderArrayModel();
        await waitFor(() => expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument());

        await user.click(screen.getByLabelText('path application.applicant[0].name'));
        await retypePath('path-editor-application.applicant[0].name', 'application.applicant[0].nope');

        const editor = screen.getByTestId('path-editor-application.applicant[0].name').firstElementChild as HTMLElement;
        await waitFor(() => expect(editor.className).toMatch(/MuiBox/));
        // The error colour is applied through `sx`, so assert on the computed style rather than a class.
        await waitFor(() => expect(getComputedStyle(editor).borderColor).not.toBe(''));
        expect(getComputedStyle(editor).borderColor).toContain('211, 47, 47');
    });

    it('leaves the row untouched when the retyped path collides with another row', async () => {
        const {user} = renderArrayModel();
        await waitFor(() => expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument());

        await user.click(screen.getByLabelText('path application.applicant[0].name'));
        const content = await retypePath(
            'path-editor-application.applicant[0].name',
            'application.applicant[0].creditLine[0].balance',
        );
        await user.click(content);
        await user.keyboard('{Enter}');

        await waitFor(() => expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument());
        expect(screen.getByTestId('row-application.applicant[0].creditLine[0].balance')).toBeInTheDocument();
    });

    it('lints nothing for a path the model declares — the first segment is not an unknown reference', async () => {
        const {user} = renderArrayModel();
        await waitFor(() => expect(screen.getByTestId('row-application.applicant[0].creditLine')).toBeInTheDocument());

        await user.click(screen.getByLabelText('path application.applicant[0].creditLine'));
        const editor = await screen.findByTestId('path-editor-application.applicant[0].creditLine');

        // Let a lint cycle run, then assert nothing was marked anywhere in the cell.
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(editor.querySelector('.cm-lintRange-error, .cm-lintPoint-error')).toBeNull();
    });

    it('marks only the undeclared segment of a wrong path', async () => {
        const {user} = renderArrayModel();
        await waitFor(() => expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument());

        await user.click(screen.getByLabelText('path application.applicant[0].name'));
        await retypePath('path-editor-application.applicant[0].name', 'application.applicant[0].nope');

        const editor = screen.getByTestId('path-editor-application.applicant[0].name');
        await waitFor(() => expect(editor.querySelector('.cm-lintRange-error, .cm-lintPoint-error')).not.toBeNull());
        expect(editor.querySelector('.cm-lintRange-error')?.textContent).toBe('nope');
    });

    it('completes addressable paths — not model built-ins — and hosts the popup outside the grid', async () => {
        const {user} = renderArrayModel();
        await waitFor(() => expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument());

        await user.click(screen.getByLabelText('path application.applicant[0].name'));
        await retypePath('path-editor-application.applicant[0].name', 'application.');
        const view = await pathEditorView('path-editor-application.applicant[0].name');
        view.focus();
        startCompletion(view);

        await waitFor(() => {
            const options = currentCompletions(view.state).map((completion) => completion.label);
            expect(options).toContain('application.applicant');
            expect(options).toContain('application.applicant[0].creditLine[0].balance');
            // Model built-ins have no business in a path cell.
            expect(options.some((label) => label.includes('('))).toBe(false);
        });

        // The popup lives at the document root, so neither the scroll container nor the rows painted
        // after this one can clip or cover it.
        const popup = document.querySelector('.cm-tooltip-autocomplete');
        expect(popup).not.toBeNull();
        expect(screen.getByTestId('tests-grid').contains(popup)).toBe(false);
    });

    it('shows a path the model no longer declares in the error colour', async () => {
        const user = userEvent.setup();
        const modelName = uniqueModelName();
        // No `totals.first` here: removing a field another expression reads would break the model
        // instead of just dropping the field.
        const service = MutableDecisionService.fromCode(`{
        type CreditLine: { balance: <number>, limit: <number> }
        type Applicant: { name: <string>, creditLine: <CreditLine[]> }
        application: { applicant: <Applicant[]> }
        reference: <string>
    }`);
        const {rerender} = render(<TestsManager service={service} modelName={modelName} revision={1} />);
        await waitFor(() => expect(screen.getByTestId('row-application.applicant[0].name')).toBeInTheDocument());

        // Duplicate first: a custom row survives the model dropping the field it was built from.
        await user.click(screen.getByLabelText('row menu application.applicant[0].name'));
        await user.click(screen.getByRole('menuitem', {name: 'Duplicate'}));
        await screen.findByTestId('row-application.applicant[1].name');

        service.remove('application.applicant');
        rerender(<TestsManager service={service} modelName={modelName} revision={2} />);

        await waitFor(() =>
            expect(getComputedStyle(screen.getByLabelText('path application.applicant[1].name')).color).toContain(
                '211, 47, 47',
            ),
        );
    });
});
