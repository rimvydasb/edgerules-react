import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {EditorView} from '@codemirror/view';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {BoxedEditor} from '../BoxedEditor';
import {createBoxedEditorService} from '../service/createBoxedEditorService';

const languageService = MutableDecisionService;

const MODEL = `{
  type Applicant: { age: <number, required: true>; name: <string> }
  application: { amount: <number, required: true> }
}`;

function buildService() {
    return createBoxedEditorService(MutableDecisionService.fromCode(MODEL));
}

/** Opens the `index`-th row's three-dot menu (document order) and clicks the named item. */
async function chooseAction(user: ReturnType<typeof userEvent.setup>, index: number, label: string): Promise<void> {
    const buttons = screen.getAllByLabelText('Open row actions');
    await user.click(buttons[index]);
    await user.click(screen.getByText(label));
}

function queryEditable(container: HTMLElement): HTMLElement {
    const editable = container.querySelector('.cm-content[contenteditable="true"]');
    if (!editable) throw new Error('Could not find a contenteditable CodeMirror element');
    return editable as HTMLElement;
}

function getView(container: HTMLElement): EditorView {
    const dom = container.querySelector('.cm-editor');
    const view = dom && EditorView.findFromDOM(dom as HTMLElement);
    if (!view) throw new Error('Could not find the CodeMirror view');
    return view;
}

function replaceDoc(container: HTMLElement, text: string): void {
    const view = getView(container);
    view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}});
}

// A `type-definition` member (`Applicant.name`) isn't itself addressable by the engine's
// `set`/`remove`/`rename` — only the whole named `type` entity is (`set_user_type` replaces its
// whole body). `createBoxedEditorService`'s `complexTypeOwner` coalesces every member edit into a
// whole-type rewrite, the same way `optimisationOwner` already does for `@optimise` settings.
describe('complexType field editing', () => {
    it('re-commits an unchanged type field without a "wrong field path" error', async () => {
        const user = userEvent.setup();
        const service = buildService();
        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        await user.click(screen.getByText('<string>'));
        await user.keyboard('{Enter}');

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(service.getBoxedRowData('Applicant.name')).toMatchObject({value: '<string>'});
    });

    it('commits a changed type field and updates the model', async () => {
        const user = userEvent.setup();
        const service = buildService();
        const {container} = render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        await user.click(screen.getByText('<string>'));
        await user.click(queryEditable(container));
        replaceDoc(container, '<string, required: true>');
        await user.keyboard('{Enter}');

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(service.toPortable().Applicant).toMatchObject({
            name: {'@kind': 'type', type: 'string', required: true},
        });
    });

    it('adds a new field via the trailing "(new field)" placeholder', async () => {
        const user = userEvent.setup();
        const service = buildService();
        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        await user.click(screen.getByText('(new field)'));

        expect(screen.getByText('field')).toBeInTheDocument();
        expect(service.toPortable().Applicant).toMatchObject({field: 'string'});
    });

    it('adds a new field via the three-dot "Add field" menu action', async () => {
        const user = userEvent.setup();
        const service = buildService();
        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        // Row 0 is the `model` header row itself; row 1 is `Applicant` (root rows sort
        // complexType first).
        await chooseAction(user, 1, 'Add field');

        expect(screen.getByText('field')).toBeInTheDocument();
        expect(service.toPortable().Applicant).toMatchObject({field: 'string'});
    });

    it('deletes a type field via its three-dot menu', async () => {
        const user = userEvent.setup();
        const service = buildService();
        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        const nameRowIndex = screen
            .getAllByLabelText('Open row actions')
            .findIndex((button) => button.closest('[data-testid="row-Applicant.name"]') !== null);
        await chooseAction(user, nameRowIndex, 'Delete');

        expect(screen.queryByText('name')).not.toBeInTheDocument();
        expect(service.toPortable().Applicant).not.toHaveProperty('name');
    });
});

describe('row name editing', () => {
    it('renames a type-definition field via its name cell', async () => {
        const user = userEvent.setup();
        const service = buildService();
        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        await user.click(screen.getByText('name'));
        await user.keyboard('{Control>}a{/Control}fullName{Enter}');

        expect(screen.getByText('fullName')).toBeInTheDocument();
        expect(service.toPortable().Applicant).toMatchObject({fullName: {'@kind': 'type'}});
        expect(service.toPortable().Applicant).not.toHaveProperty('name');
    });

    it('renames an ordinary context field via its name cell', async () => {
        const user = userEvent.setup();
        const service = buildService();
        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        await user.click(screen.getByText('amount'));
        await user.keyboard('{Control>}a{/Control}loanAmount{Enter}');

        expect(screen.getByText('loanAmount')).toBeInTheDocument();
        const application = service.toPortable().application as Record<string, unknown>;
        expect(application).toHaveProperty('loanAmount');
        expect(application).not.toHaveProperty('amount');
    });

    it('shows an inline error and keeps editing on a colliding rename', async () => {
        const user = userEvent.setup();
        const service = buildService();
        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        await user.click(screen.getByText('name'));
        await user.keyboard('{Control>}a{/Control}age{Enter}');

        expect(await screen.findByRole('alert')).toBeInTheDocument();
        // Still in the model unchanged, and the cell keeps focus/edit state (same "rejected
        // edit" contract as `ExpressionCell`) rather than reverting to static text.
        expect(service.toPortable().Applicant).toHaveProperty('name');
        expect(screen.getByDisplayValue('age')).toBeInTheDocument();
    });

    it('cancels a rename on Escape without committing', async () => {
        const user = userEvent.setup();
        const service = buildService();
        render(<BoxedEditor service={service} path="*" languageService={languageService} />);

        await user.click(screen.getByText('name'));
        await user.keyboard('{Control>}a{/Control}whatever{Escape}');

        expect(screen.getByText('name')).toBeInTheDocument();
        expect(service.toPortable().Applicant).toHaveProperty('name');
    });
});
