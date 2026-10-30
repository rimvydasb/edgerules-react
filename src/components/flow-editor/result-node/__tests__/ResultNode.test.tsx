import {EditorView} from '@codemirror/view';
import {fireEvent, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import type {FlowEditorOpenTarget} from '../../flow-editor-types';
import {renderNode} from '../../testing/renderNode';
import {SERVICE_MODEL} from '../../testing/serviceModel';

const renderResult = (options: Parameters<typeof renderNode>[1] = {}) =>
    renderNode('quote.return', {model: SERVICE_MODEL, root: 'quote', service: 'result', ...options});

const handles = () => [...document.querySelectorAll('[data-handleid]')].map((pin) => pin.getAttribute('data-handleid'));

describe('ResultNode', () => {
    it('shows each returned field with an input pin and its expression, and an add row', () => {
        renderResult();
        const node = screen.getByTestId('result-node-quote.return');
        expect(node).toHaveTextContent('Quote');
        expect(node).toHaveTextContent('{ score, installment }');
        expect(screen.getByRole('button', {name: 'Value of score'})).toHaveTextContent('score');
        expect(handles()).toEqual(['in:score', 'in:installment', 'in:+']);
        expect(screen.getByTestId('result-add-row')).toHaveTextContent('Wire a value here');
    });

    it('has no add row in read-only mode', () => {
        renderResult({readOnly: true});
        expect(screen.queryByTestId('result-add-row')).toBeNull();
        expect(handles()).toEqual(['in:score', 'in:installment']);
    });

    it('renames a field', async () => {
        const {service} = renderResult();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', {name: 'score'}));
        const input = await screen.findByRole('textbox', {name: 'Rename result field score'});
        await user.clear(input);
        await user.type(input, 'rating{Enter}');
        await waitFor(() =>
            expect(service.getResultNode('quote.return').fields.map((item) => item.name)).toEqual([
                'rating',
                'installment',
            ]),
        );
    });

    it('edits the expression of a field', async () => {
        const {service} = renderResult();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', {name: 'Value of score'}));
        const host = await screen.findByTestId('value-editor-score');
        const view = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!;
        view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: 'score * 2'}});
        await user.click(host.querySelector('.cm-content') as HTMLElement);
        await user.keyboard('{Enter}');
        await waitFor(() => expect(service.getResultNode('quote.return').fields[0].value).toBe('score * 2'));
    });

    it('shows why a field that a caller reads cannot leave the result', async () => {
        renderResult();
        fireEvent.click(screen.getByRole('button', {name: 'Actions for result field installment'}));
        fireEvent.click(await screen.findByRole('menuitem', {name: 'Delete field'}));
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Value of installment'})).toBeInTheDocument();
    });

    it('offers the node menu and routes the host items', async () => {
        const onOpenNode = vi.fn<(target: FlowEditorOpenTarget) => void>();
        renderResult({onOpenNode});
        fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
        const menu = await screen.findByRole('menu');
        for (const name of ['Rename node', 'Open in boxed editor', 'View as code', 'Remove from flow', 'Delete']) {
            expect(within(menu).getByRole('menuitem', {name})).toBeInTheDocument();
        }
        fireEvent.click(screen.getByRole('menuitem', {name: 'View as code'}));
        expect(onOpenNode).toHaveBeenCalledWith({path: 'quote.return', kind: 'code-editor'});
    });
});
