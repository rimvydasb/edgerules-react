import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import type {FlowEditorOpenTarget} from '../../flow-editor-types';
import {renderNode} from '../../testing/renderNode';
import {SERVICE_MODEL} from '../../testing/serviceModel';

const renderParameter = (field = 'quote.applicant', options: Parameters<typeof renderNode>[1] = {}) =>
    renderNode(field, {model: SERVICE_MODEL, root: 'quote', service: 'parameter', ...options});

const handles = () => [...document.querySelectorAll('[data-handleid]')].map((pin) => pin.getAttribute('data-handleid'));

const openMenu = async () => {
    fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
    return screen.findByRole('menu');
};

describe('ParameterNode', () => {
    it('draws a record parameter from its type: a pin per field and one for the record, no values', () => {
        renderParameter();
        const node = screen.getByTestId('parameter-node-quote.applicant');
        expect(node).toHaveTextContent('applicant');
        expect(node).toHaveTextContent('Applicant');
        expect(node).toHaveTextContent('age');
        expect(node).toHaveTextContent('income');
        expect(handles()).toEqual(['out:*', 'out:age', 'out:income']);
        expect(screen.queryByRole('button', {name: /Value of/})).toBeNull();
    });

    it('draws a parameter of another type with one pin', () => {
        renderParameter('quote.amount');
        expect(screen.getByTestId('parameter-node-quote.amount')).toHaveTextContent('number');
        expect(handles()).toEqual(['out:*']);
    });

    it('renames the parameter from its title, in the body and at the call sites', async () => {
        const {mutable} = renderParameter();
        await openMenu();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Rename parameter'}));
        const input = await screen.findByRole('textbox', {name: 'Name of node quote.applicant'});
        const user = userEvent.setup();
        await user.clear(input);
        await user.type(input, 'person{Enter}');
        await waitFor(() =>
            expect(mutable.toPortable()).toMatchObject({quote: {'@parameters': {person: 'Applicant'}}}),
        );
        expect(JSON.stringify(mutable.toPortable())).toContain('quote(person:');
    });

    it('changes the type in the summary line', async () => {
        const {service} = renderNode('f.a', {
            model: '{ @Service func f(a: number): { r: 1 } }',
            root: 'f',
            service: 'parameter',
        });
        await openMenu();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Change type'}));
        const input = await screen.findByRole('textbox', {name: 'Type of parameter a'});
        const user = userEvent.setup();
        await user.clear(input);
        await user.type(input, 'string{Enter}');
        await waitFor(() => expect(service.getParameterNode('f.a').type).toBe('string'));
    });

    it('disables Delete while the service reads the parameter', async () => {
        renderParameter();
        await openMenu();
        expect(screen.getByRole('menuitem', {name: 'Delete parameter'})).toHaveAttribute('data-disabled', 'true');
        expect(screen.queryByRole('menuitem', {name: 'Remove from flow'})).toBeNull();
    });

    it('opens its record type in the Boxed Editor, also in read-only mode', async () => {
        const onOpenNode = vi.fn<(target: FlowEditorOpenTarget) => void>();
        renderParameter('quote.applicant', {onOpenNode, readOnly: true});
        await openMenu();
        expect(screen.queryByRole('menuitem', {name: 'Rename parameter'})).toBeNull();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Open Applicant in boxed editor'}));
        expect(onOpenNode).toHaveBeenCalledWith({path: 'Applicant', kind: 'boxed-editor'});
    });
});
