import {fireEvent, screen, waitFor, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import type {FlowEditorOpenTarget} from '../../flow-editor-types';
import {renderNode} from '../../testing/renderNode';

const LIST_MODEL = `{
    @InputNode(name: "People")
    people: [{ id: "a"; age: 30 }, { id: "b"; age: 41 }, { id: "c"; age: 25 }]
    scores: [1, 2, 3]
    many: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    none: []
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

    it('shows the items: one row per item and one column per item field', async () => {
        renderList();
        const table = await screen.findByTestId('list-input-table');
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((cell) => cell.textContent),
        ).toEqual(['#', 'id', 'age']);
        const rows = within(table).getAllByRole('row').slice(1);
        expect(rows.map((row) => row.textContent)).toEqual(['1a30', '2b41', '3c25']);
    });

    it('shows a list of plain values: one row per value', async () => {
        renderList('scores');
        expect(await screen.findByText('number[] · 3 items')).toBeInTheDocument();
        const table = screen.getByTestId('list-input-table');
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((cell) => cell.textContent),
        ).toEqual(['#', 'value']);
        expect(
            within(table)
                .getAllByRole('row')
                .slice(1)
                .map((row) => row.textContent),
        ).toEqual(['11', '22', '33']);
    });

    it('shows at most 10 items, then a row of …', async () => {
        renderList('many');
        expect(await screen.findByText('number[] · 12 items')).toBeInTheDocument();
        const table = screen.getByTestId('list-input-table');
        // The header row, 10 items and the `…` row.
        expect(within(table).getAllByRole('row')).toHaveLength(12);
        expect(within(table).getByTestId('list-input-more-rows')).toHaveTextContent('……');
        expect(within(table).queryByText('11')).toBeNull();
    });

    it('shows a value that is not a list as text: the engine reads an untyped [] as Missing', async () => {
        renderList('none');
        expect(await screen.findByText("'Missing('empty list')'")).toBeInTheDocument();
        expect(screen.queryByTestId('list-input-table')).toBeNull();
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
