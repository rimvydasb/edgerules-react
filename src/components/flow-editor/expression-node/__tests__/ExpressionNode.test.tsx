import {fireEvent, screen, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import type {FlowEditorOpenTarget} from '../../flow-editor-types';
import {renderNode} from '../../testing/renderNode';

// A literal and two expressions that read it, one through the other.
const EXPRESSION_MODEL = `{
    rate: 0.2
    tax: 1000 * rate
    net: 1000 - tax
}`;

const renderExpression = (field = 'tax', options: Parameters<typeof renderNode>[1] = {}) =>
    renderNode(field, {model: EXPRESSION_MODEL, ...options, expression: true});

// Renames the field of the node through its menu and the inline input; returns the input.
async function renameTo(name: string): Promise<HTMLElement> {
    fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
    fireEvent.click(await screen.findByRole('menuitem', {name: 'Rename field'}));
    const input = await screen.findByRole('textbox', {name: /^Field name of node/});
    fireEvent.change(input, {target: {value: name}});
    fireEvent.keyDown(input, {key: 'Enter'});
    return input;
}

describe('ExpressionNode', () => {
    it('shows a one-row header with the field name, one input pin and one output pin', () => {
        renderExpression();
        const node = screen.getByTestId('expression-node-tax');
        expect(node).toHaveTextContent('tax');
        expect(screen.getByTitle('tax = 1000 * rate : number')).toBeInTheDocument();
        const pins = document.querySelectorAll('[data-handleid]');
        expect([...pins].map((pin) => pin.getAttribute('data-handleid'))).toEqual(['in:*', 'out:*']);
        expect(document.querySelector('[data-handleid="out:*"]')).toHaveAttribute('data-type', 'number');
        expect(document.querySelector('[data-handleid="in:*"]')).toHaveAttribute('title', 'tax reads rate');
    });

    it('offers the node menu without Rename node and Remove from flow, and routes the host items', async () => {
        const onOpenNode = vi.fn<(target: FlowEditorOpenTarget) => void>();
        renderExpression('tax', {onOpenNode});
        fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
        await screen.findByRole('menu');
        for (const name of ['Rename field', 'Duplicate', 'Add description', 'View as code', 'Delete']) {
            expect(screen.getByRole('menuitem', {name})).toBeInTheDocument();
        }
        expect(screen.queryByRole('menuitem', {name: 'Rename node'})).toBeNull();
        expect(screen.queryByRole('menuitem', {name: 'Remove from flow'})).toBeNull();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Open in boxed editor'}));
        expect(onOpenNode).toHaveBeenCalledWith({path: 'tax', kind: 'boxed-editor'});
    });

    it('renames the field inline and moves its description', async () => {
        const {mutable, documentation} = renderExpression('rate');
        documentation.setDescription('rate', 'The tax rate');
        await renameTo('taxRate');
        await waitFor(() => expect(mutable.toPortable()).toHaveProperty('taxRate'));
        expect(documentation.getDescription('taxRate')).toBe('The tax rate');
    });

    it('keeps the inline rename open on a taken name', async () => {
        renderExpression('rate');
        const input = await renameTo('net');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('textbox', {name: 'Field name of node rate'})).toBeInTheDocument();
    });

    it('is read-only: the host routes only', async () => {
        renderExpression('tax', {readOnly: true, onOpenNode: vi.fn()});
        fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
        await screen.findByRole('menu');
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
            'Open in boxed editor',
            'View as code',
        ]);
    });

    it('is read-only without host routes: no node menu', () => {
        renderExpression('tax', {readOnly: true});
        expect(screen.queryByRole('button', {name: 'Node actions'})).toBeNull();
    });
});
