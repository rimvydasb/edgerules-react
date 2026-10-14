import {fireEvent, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {renderNode} from './renderNode';

// xyflow measures pin positions in a browser; jsdom has no layout. The spy records when a node is told to measure.
const updateNodeInternals = vi.fn();
vi.mock('@xyflow/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@xyflow/react')>();
    return {...actual, useUpdateNodeInternals: () => updateNodeInternals};
});

const callsFor = (id: string) => updateNodeInternals.mock.calls.filter(([nodeId]) => nodeId === id).length;

beforeEach(() => updateNodeInternals.mockClear());

describe('pin positions are measured again when the rows change', () => {
    it('measures an InputNode once on mount', () => {
        renderNode('applicant', {input: true});
        expect(callsFor('applicant')).toBeGreaterThan(0);
    });

    it('measures an InputNode again after Move down', async () => {
        renderNode('applicant', {input: true});
        const before = callsFor('applicant');
        fireEvent.click(screen.getByRole('button', {name: 'Actions for field age'}));
        fireEvent.click(await screen.findByRole('menuitem', {name: 'Move down'}));
        await waitFor(() => expect(callsFor('applicant')).toBeGreaterThan(before));
    });

    it('measures an InputNode again after a field is added', async () => {
        const {service} = renderNode('applicant', {input: true});
        const before = callsFor('applicant');
        service.addInputField('applicant');
        await waitFor(() => expect(callsFor('applicant')).toBeGreaterThan(before));
    });

    it('measures a FunctionNode again after an argument moves', async () => {
        renderNode('decision');
        const before = callsFor('decision');
        fireEvent.click(screen.getByRole('button', {name: 'Actions for argument segment'}));
        fireEvent.click(await screen.findByRole('menuitem', {name: 'Move up'}));
        await waitFor(() => expect(callsFor('decision')).toBeGreaterThan(before));
    });

    it('does not measure again when nothing changed', async () => {
        const {service} = renderNode('applicant', {input: true});
        await waitFor(() => expect(callsFor('applicant')).toBeGreaterThan(0));
        const before = callsFor('applicant');
        service.setNodeName('applicant', 'Applicant'); // changes the label, not the pins
        await waitFor(() => expect(service.getInputNode('applicant').label).toBe('Applicant'));
        expect(callsFor('applicant')).toBe(before);
    });
});
