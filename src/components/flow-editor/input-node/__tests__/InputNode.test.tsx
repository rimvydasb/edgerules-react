import {EditorView} from '@codemirror/view';
import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import type {FlowEditorOpenTarget} from '../../flow-editor-types';
import {renderNode} from '../../testing/renderNode';

const renderInput = (options: Parameters<typeof renderNode>[1] = {}) =>
    renderNode('applicant', {...options, input: true});

describe('InputNode', () => {
    it('shows the record structure: one pin and one name per field', () => {
        renderInput();
        const container = document.body;
        expect(screen.getByTestId('input-node-applicant')).toBeInTheDocument();
        for (const name of ['age', 'income', 'segment']) {
            expect(screen.getByRole('button', {name: new RegExp(`^${name}$`)})).toBeInTheDocument();
            expect(container.querySelector(`[data-handleid="out:${name}"]`)).not.toBeNull();
        }
        expect(container.querySelector('[data-handleid="out:*"]')).not.toBeNull();
        expect(screen.getByText('fields')).toBeInTheDocument();
    });

    it('shows a Field column and a Value column', () => {
        renderInput();
        expect(screen.getByText('values')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Value of age'})).toHaveTextContent('23');
        expect(screen.getByRole('button', {name: 'Value of income'})).toHaveTextContent('25000');
        expect(screen.getByRole('button', {name: 'Value of segment'})).toHaveTextContent("'retail'");
    });

    describe('value cell', () => {
        // Replaces the editor text as a user would, then commits with Enter.
        const typeValue = async (name: string, text: string) => {
            const user = userEvent.setup();
            await user.click(screen.getByRole('button', {name: `Value of ${name}`}));
            const host = await screen.findByTestId(`value-editor-${name}`);
            const view = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!;
            view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}});
            await user.click(host.querySelector('.cm-content') as HTMLElement);
            await user.keyboard('{Enter}');
        };

        it('writes the edited value and recalculates what reads it', async () => {
            const {service, mutable} = renderInput();
            expect(await service.readOutput('decision.level')).toEqual({value: 'high', type: 'string'});
            await typeValue('age', '30');
            await waitFor(() => expect(screen.getByRole('button', {name: 'Value of age'})).toHaveTextContent('30'));
            expect(mutable.toPortable()).toMatchObject({applicant: {age: 30}});
            expect(await service.readOutput('decision.level')).toEqual({value: 'medium', type: 'string'});
        });

        it('keeps the editor open and shows the error for an invalid value', async () => {
            const {mutable} = renderInput();
            await typeValue('age', '30 +');
            expect(await screen.findByRole('alert')).toBeInTheDocument();
            expect(screen.getByTestId('value-editor-age')).toBeInTheDocument();
            expect(mutable.toPortable()).toMatchObject({applicant: {age: 23}});
        });

        it('restores the value on Escape', async () => {
            const user = userEvent.setup();
            renderInput();
            await user.click(screen.getByRole('button', {name: 'Value of age'}));
            const host = await screen.findByTestId('value-editor-age');
            await user.click(host.querySelector('.cm-content') as HTMLElement);
            await user.keyboard('{Escape}');
            expect(await screen.findByRole('button', {name: 'Value of age'})).toHaveTextContent('23');
        });

        it('is read-only in read-only mode', () => {
            renderInput({readOnly: true});
            expect(screen.queryByRole('button', {name: 'Value of age'})).toBeNull();
            expect(screen.getByTestId('input-node-applicant')).toHaveTextContent('25000');
        });
    });

    it('reads Field in the singular for a one-field record', () => {
        renderNode('application', {input: true});
        expect(screen.getByText('field')).toBeInTheDocument();
    });

    it('renames a field and rewrites its references', async () => {
        const {service, mutable} = renderInput();
        fireEvent.click(screen.getByRole('button', {name: 'age'}));
        const input = await screen.findByLabelText('Rename field age');
        fireEvent.change(input, {target: {value: 'years'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        await waitFor(() => expect(service.getInputNode('applicant').fields.map((f) => f.name)).toContain('years'));
        expect(JSON.stringify(mutable.toPortable())).not.toContain('applicant.age');
        expect(JSON.stringify(mutable.toPortable())).toContain('applicant.years');
    });

    it('keeps the input open and shows the error when the name exists', async () => {
        renderInput();
        fireEvent.click(screen.getByRole('button', {name: 'age'}));
        const input = await screen.findByLabelText('Rename field age');
        fireEvent.change(input, {target: {value: 'income'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(await screen.findByLabelText('Rename field age')).toBeInTheDocument();
    });

    it('offers the node menu and routes the host items', async () => {
        const onOpenNode = vi.fn<(target: FlowEditorOpenTarget) => void>();
        renderInput({onOpenNode});
        fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
        await screen.findByRole('menu');
        for (const name of [
            'Rename node',
            'Rename field',
            'Duplicate',
            'Add description',
            'Remove from flow',
            'Delete',
        ]) {
            expect(screen.getByRole('menuitem', {name})).toBeInTheDocument();
        }
        expect(screen.queryByRole('menuitem', {name: 'Change callee…'})).toBeNull();
        fireEvent.click(screen.getByRole('menuitem', {name: 'View as code'}));
        expect(onOpenNode).toHaveBeenCalledWith({path: 'applicant', kind: 'code-editor'});
    });

    it('renames the node label', async () => {
        const {service} = renderInput();
        fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
        fireEvent.click(await screen.findByRole('menuitem', {name: 'Rename node'}));
        const input = await screen.findByLabelText('Name of node applicant');
        fireEvent.change(input, {target: {value: 'Applicant data'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        await waitFor(() => expect(service.getInputNode('applicant').label).toBe('Applicant data'));
    });

    it('is read-only: no rename buttons and no mutating menu items', async () => {
        renderInput({readOnly: true});
        expect(screen.queryByRole('button', {name: 'age'})).toBeNull();
        expect(screen.getByText('age')).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Node actions'})).toBeNull();
    });

    describe('field menu', () => {
        const names = (service: ReturnType<typeof renderNode>['service']) =>
            service.getInputNode('applicant').fields.map((item) => item.name);
        const open = async (name: string) => {
            fireEvent.click(screen.getByRole('button', {name: `Actions for field ${name}`}));
            return screen.findByRole('menu');
        };

        it('disables Delete field for a field that an expression reads', async () => {
            renderInput();
            await open('age');
            expect(screen.getByRole('menuitem', {name: 'Delete field'})).toBeDisabled();
        });

        it('disables Move up on the first row and Move down on the last row', async () => {
            renderInput();
            await open('age');
            expect(screen.getByRole('menuitem', {name: 'Move up'})).toBeDisabled();
            expect(screen.getByRole('menuitem', {name: 'Move down'})).toBeEnabled();
            fireEvent.keyDown(document.body, {key: 'Escape'});
        });

        it('moves a field', async () => {
            const {service} = renderInput();
            await open('segment');
            fireEvent.click(screen.getByRole('menuitem', {name: 'Move up'}));
            await waitFor(() => expect(names(service)).toEqual(['age', 'segment', 'income']));
        });

        it('Add field below inserts after the row and opens the name input', async () => {
            const {service} = renderInput();
            await open('age');
            fireEvent.click(screen.getByRole('menuitem', {name: 'Add field below'}));
            await waitFor(() => expect(names(service)).toEqual(['age', 'field', 'income', 'segment']));
            const input = await screen.findByLabelText('Rename field field');
            fireEvent.change(input, {target: {value: 'region'}});
            fireEvent.keyDown(input, {key: 'Enter'});
            await waitFor(() => expect(names(service)).toEqual(['age', 'region', 'income', 'segment']));
        });

        it('is not offered in read-only mode', () => {
            renderInput({readOnly: true});
            expect(screen.queryByRole('button', {name: /Actions for field/})).toBeNull();
        });
    });
});
