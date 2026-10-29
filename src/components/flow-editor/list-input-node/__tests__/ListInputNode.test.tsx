import {fireEvent, screen, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import type {FlowEditorOpenTarget} from '../../flow-editor-types';
import {renderNode} from '../../testing/renderNode';

const LIST_MODEL = `{
    @InputNode(name: "People")
    people: [{ id: "a"; age: 30 }, { id: "b"; age: 41 }, { id: "c"; age: 25 }]
    scores: [1, 2, 3]
    oldest: max(for p in people return p.age)
}`;

const renderList = (field = 'people', options: Parameters<typeof renderNode>[1] = {}) =>
    renderNode(field, {model: LIST_MODEL, ...options, input: 'list'});

describe('ListInputNode', () => {
    it('has one output pin for the whole list', () => {
        renderList();
        expect(screen.getByTestId('list-input-node-people')).toBeInTheDocument();
        const pins = document.querySelectorAll('[data-handleid]');
        expect([...pins].map((pin) => pin.getAttribute('data-handleid'))).toEqual(['out:*']);
    });

    it('shows the list type and the number of items in the header', async () => {
        renderList();
        expect(screen.getByText('People')).toBeInTheDocument();
        expect(await screen.findByText('object[] · 3 items')).toBeInTheDocument();
    });

    it('shows the shape of an item: one row per field with its type', () => {
        renderList();
        expect(screen.getByText('item fields')).toBeInTheDocument();
        expect(screen.getByText('types')).toBeInTheDocument();
        for (const [name, type] of [
            ['id', 'string'],
            ['age', 'number'],
        ]) {
            expect(screen.getByTitle(`${name} : ${type}`)).toHaveTextContent(name);
        }
    });

    it('describes a list of plain values', async () => {
        renderList('scores');
        expect(screen.getByText('A list of number values.')).toBeInTheDocument();
        expect(await screen.findByText('number[] · 3 items')).toBeInTheDocument();
    });

    it('counts the items again after the list changes', async () => {
        const {mutable, service} = renderList('scores');
        expect(await screen.findByText('number[] · 3 items')).toBeInTheDocument();
        mutable.set('scores', {...(mutable.toPortable().scores as object), expression: '[1, 2]'} as never);
        service.setNodeName('scores', 'Scores'); // a committed change notifies the nodes
        expect(await screen.findByText('number[] · 2 items')).toBeInTheDocument();
    });

    it('offers the node menu and routes the host items', async () => {
        const onOpenNode = vi.fn<(target: FlowEditorOpenTarget) => void>();
        renderList('people', {onOpenNode});
        fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
        await screen.findByRole('menu');
        for (const name of ['Rename node', 'Rename field', 'Duplicate', 'Remove from flow', 'Delete']) {
            expect(screen.getByRole('menuitem', {name})).toBeInTheDocument();
        }
        expect(screen.queryByRole('menuitem', {name: 'Add field'})).toBeNull();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Open in boxed editor'}));
        expect(onOpenNode).toHaveBeenCalledWith({path: 'people', kind: 'boxed-editor'});
    });

    it('renames the node label', async () => {
        const {service} = renderList();
        fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
        fireEvent.click(await screen.findByRole('menuitem', {name: 'Rename node'}));
        const input = await screen.findByLabelText('Name of node people');
        fireEvent.change(input, {target: {value: 'Prospects'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        await waitFor(() => expect(service.getListInputNode('people').label).toBe('Prospects'));
    });

    it('is read-only: no node menu', () => {
        renderList('people', {readOnly: true});
        expect(screen.queryByRole('button', {name: 'Node actions'})).toBeNull();
    });
});
