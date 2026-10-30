import {EditorView} from '@codemirror/view';
import {fireEvent, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import type {FlowEditorOpenTarget} from '../../flow-editor-types';
import {renderNode} from '../../testing/renderNode';
import {SERVICE_MODEL} from '../../testing/serviceModel';

const renderReturn = (options: Parameters<typeof renderNode>[1] = {}) =>
    renderNode('quote.return', {model: SERVICE_MODEL, root: 'quote', service: 'return', ...options});

const handles = () => [...document.querySelectorAll('[data-handleid]')].map((pin) => pin.getAttribute('data-handleid'));

describe('ReturnNode', () => {
    it('shows each returned field with an input pin and its expression, and an add row', () => {
        renderReturn();
        const node = screen.getByTestId('return-node-quote.return');
        expect(node).toHaveTextContent('Quote');
        expect(node).toHaveTextContent('{ score, installment }');
        expect(screen.getByRole('button', {name: 'Value of score'})).toHaveTextContent('score');
        expect(handles()).toEqual(['in:score', 'in:installment', 'in:+']);
        expect(screen.getByTestId('return-add-row')).toHaveTextContent('Wire a value here');
    });

    it('has no add row in read-only mode', () => {
        renderReturn({readOnly: true});
        expect(screen.queryByTestId('return-add-row')).toBeNull();
        expect(handles()).toEqual(['in:score', 'in:installment']);
    });

    it('renames a field', async () => {
        const {service} = renderReturn();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', {name: 'score'}));
        const input = await screen.findByRole('textbox', {name: 'Rename return field score'});
        await user.clear(input);
        await user.type(input, 'rating{Enter}');
        await waitFor(() =>
            expect(service.getReturnNode('quote.return').fields.map((item) => item.name)).toEqual([
                'rating',
                'installment',
            ]),
        );
    });

    it('edits the expression of a field', async () => {
        const {service} = renderReturn();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', {name: 'Value of score'}));
        const host = await screen.findByTestId('value-editor-score');
        const view = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!;
        view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: 'score * 2'}});
        await user.click(host.querySelector('.cm-content') as HTMLElement);
        await user.keyboard('{Enter}');
        await waitFor(() => expect(service.getReturnNode('quote.return').fields[0].value).toBe('score * 2'));
    });

    it('shows why a field that a caller reads cannot leave the return', async () => {
        renderReturn();
        fireEvent.click(screen.getByRole('button', {name: 'Actions for return field installment'}));
        fireEvent.click(await screen.findByRole('menuitem', {name: 'Delete field'}));
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Value of installment'})).toBeInTheDocument();
    });

    it('offers the node menu and routes the host items', async () => {
        const onOpenNode = vi.fn<(target: FlowEditorOpenTarget) => void>();
        renderReturn({onOpenNode});
        fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
        const menu = await screen.findByRole('menu');
        for (const name of ['Rename node', 'Open in boxed editor', 'View as code', 'Delete']) {
            expect(within(menu).getByRole('menuitem', {name})).toBeInTheDocument();
        }
        // The return is always on the flow of its service.
        expect(within(menu).queryByRole('menuitem', {name: 'Remove from flow'})).toBeNull();
        fireEvent.click(screen.getByRole('menuitem', {name: 'View as code'}));
        expect(onOpenNode).toHaveBeenCalledWith({path: 'quote.return', kind: 'code-editor'});
    });

    it('shows a returned expression as one row with its text, one input pin and its type', async () => {
        const {service} = renderNode('f.return', {
            model: '{ @Service func f(a: number): { b: a * 2; return: b + 1 } }',
            root: 'f',
            service: 'return',
        });
        const node = screen.getByTestId('return-node-f.return');
        expect(node).toHaveTextContent('Return');
        expect(screen.getByRole('button', {name: 'Value of return'})).toHaveTextContent('b + 1');
        expect(handles()).toEqual(['in:*']);
        expect(screen.queryByTestId('return-add-row')).toBeNull();

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', {name: 'Value of return'}));
        const host = await screen.findByTestId('value-editor-return');
        const view = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!;
        view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: 'b + a'}});
        await user.click(host.querySelector('.cm-content') as HTMLElement);
        await user.keyboard('{Enter}');
        await waitFor(() => expect(service.getReturnNode('f.return').expression).toBe('b + a'));
    });
});
