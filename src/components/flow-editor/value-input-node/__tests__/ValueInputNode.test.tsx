import {EditorView} from '@codemirror/view';
import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import type {FlowEditorOpenTarget} from '../../flow-editor-types';
import {renderNode} from '../../testing/renderNode';

// A single number and a single string, each read by an expression.
const VALUE_MODEL = `{
    @InputNode(name: "Age")
    age: 23
    @InputNode
    segment: "retail"
    adult: age >= 18
}`;

const renderValue = (field = 'age', options: Parameters<typeof renderNode>[1] = {}) =>
    renderNode(field, {model: VALUE_MODEL, ...options, input: 'value'});

describe('ValueInputNode', () => {
    it('shows a single primitive value with its type and one output pin', () => {
        renderValue();
        const node = screen.getByTestId('value-input-node-age');
        expect(node).toHaveTextContent('Age');
        expect(node).toHaveTextContent('number');
        expect(screen.getByRole('button', {name: 'Value of age'})).toHaveTextContent('23');
        const pins = document.querySelectorAll('[data-handleid]');
        expect([...pins].map((pin) => pin.getAttribute('data-handleid'))).toEqual(['out:*']);
    });

    it('shows a string value', () => {
        renderValue('segment');
        expect(screen.getByTestId('value-input-node-segment')).toHaveTextContent('string');
        expect(screen.getByRole('button', {name: 'Value of segment'})).toHaveTextContent('"retail"');
    });

    describe('value cell', () => {
        // Replaces the editor text as a user would, then commits with Enter.
        const typeValue = async (text: string) => {
            const user = userEvent.setup();
            await user.click(screen.getByRole('button', {name: 'Value of age'}));
            const host = await screen.findByTestId('value-editor-age');
            const view = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!;
            view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}});
            await user.click(host.querySelector('.cm-content') as HTMLElement);
            await user.keyboard('{Enter}');
        };

        it('writes the edited value and recalculates what reads it', async () => {
            const {service, mutable} = renderValue();
            expect(await service.readOutput('adult')).toEqual({value: true, type: 'boolean'});
            await typeValue('12');
            await waitFor(() => expect(screen.getByRole('button', {name: 'Value of age'})).toHaveTextContent('12'));
            expect(mutable.toPortable()).toMatchObject({age: {expression: '12', '@node': 'InputNode'}});
            expect(await service.readOutput('adult')).toEqual({value: false, type: 'boolean'});
        });

        it('keeps the editor open and shows the error for an invalid value', async () => {
            const {mutable} = renderValue();
            await typeValue('30 +');
            expect(await screen.findByRole('alert')).toBeInTheDocument();
            expect(screen.getByTestId('value-editor-age')).toBeInTheDocument();
            expect(mutable.toPortable()).toMatchObject({age: {expression: '23'}});
        });

        it('is read-only in read-only mode', () => {
            renderValue('age', {readOnly: true});
            expect(screen.queryByRole('button', {name: 'Value of age'})).toBeNull();
            expect(screen.getByTestId('value-input-node-age')).toHaveTextContent('23');
        });
    });

    it('offers the node menu and routes the host items', async () => {
        const onOpenNode = vi.fn<(target: FlowEditorOpenTarget) => void>();
        renderValue('age', {onOpenNode});
        fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
        await screen.findByRole('menu');
        for (const name of ['Rename node', 'Rename field', 'Duplicate', 'Remove from flow', 'Delete']) {
            expect(screen.getByRole('menuitem', {name})).toBeInTheDocument();
        }
        fireEvent.click(screen.getByRole('menuitem', {name: 'Open in boxed editor'}));
        expect(onOpenNode).toHaveBeenCalledWith({path: 'age', kind: 'boxed-editor'});
    });

    it('is read-only: no node menu', () => {
        renderValue('age', {readOnly: true});
        expect(screen.queryByRole('button', {name: 'Node actions'})).toBeNull();
    });
});
