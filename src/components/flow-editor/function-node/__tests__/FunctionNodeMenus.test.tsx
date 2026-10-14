import {fireEvent, screen, waitFor, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import type {FlowEditorOpenTarget} from '../../flow-editor-types';
import {renderNode} from '../../testing/renderNode';

async function openArgumentMenu(name: string) {
    fireEvent.click(screen.getByRole('button', {name: `Actions for argument ${name}`}));
    return screen.findByRole('menu');
}

const names = (field: string, service: ReturnType<typeof renderNode>['service']) =>
    service.getFunctionNode(field).arguments.map((argument) => argument.name);

describe('argument menu', () => {
    it('disables Delete argument for a used parameter', async () => {
        renderNode('score');
        await openArgumentMenu('age');
        const item = screen.getByRole('menuitem', {name: 'Delete argument'});
        expect(item).toBeDisabled();
    });

    it('disables Move up on the first row and Move down on the last row', async () => {
        renderNode('decision');
        await openArgumentMenu('age');
        expect(screen.getByRole('menuitem', {name: 'Move up'})).toBeDisabled();
        expect(screen.getByRole('menuitem', {name: 'Move down'})).toBeEnabled();
    });

    it('disables Move down on the last row', async () => {
        renderNode('decision');
        await openArgumentMenu('segment');
        expect(screen.getByRole('menuitem', {name: 'Move down'})).toBeDisabled();
        expect(screen.getByRole('menuitem', {name: 'Move up'})).toBeEnabled();
    });

    it('moves an argument', async () => {
        const {service} = renderNode('decision');
        await openArgumentMenu('segment');
        fireEvent.click(screen.getByRole('menuitem', {name: 'Move up'}));
        await waitFor(() => expect(names('decision', service)).toEqual(['age', 'segment', 'income']));
    });

    it('shows how many callers the change reaches', async () => {
        renderNode('decision');
        const menu = await openArgumentMenu('age');
        expect(within(menu).getByText(/for 1 caller$/)).toBeInTheDocument();
        expect(within(menu).getByText('risk')).toBeInTheDocument();
    });

    it('Add argument below inserts after the row and opens the name input', async () => {
        const {service} = renderNode('decision');
        await openArgumentMenu('age');
        fireEvent.click(screen.getByRole('menuitem', {name: 'Add argument below'}));
        await waitFor(() => expect(names('decision', service)).toEqual(['age', 'arg', 'income', 'segment']));
        const input = await screen.findByLabelText('Name of argument arg');
        fireEvent.change(input, {target: {value: 'region'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        await waitFor(() => expect(names('decision', service)).toEqual(['age', 'region', 'income', 'segment']));
    });

    it('Escape keeps the generated argument name', async () => {
        const {service} = renderNode('decision');
        await openArgumentMenu('segment');
        fireEvent.click(screen.getByRole('menuitem', {name: 'Add argument below'}));
        const input = await screen.findByLabelText('Name of argument arg');
        fireEvent.change(input, {target: {value: 'region'}});
        fireEvent.keyDown(input, {key: 'Escape'});
        expect(names('decision', service)).toEqual(['age', 'income', 'segment', 'arg']);
    });

    it('is not offered in read-only mode', () => {
        renderNode('decision', {readOnly: true});
        expect(screen.queryByRole('button', {name: /Actions for argument/})).not.toBeInTheDocument();
    });
});

describe('node menu', () => {
    const open = async () => {
        fireEvent.click(screen.getByRole('button', {name: 'Node actions'}));
        return screen.findByRole('menu');
    };

    it('lists the items of the Menus table', async () => {
        renderNode('decision', {onOpenNode: () => {}});
        const menu = await open();
        const labels = within(menu)
            .getAllByRole('menuitem')
            .map((item) => item.textContent);
        expect(labels).toEqual([
            'Rename node',
            'Rename field',
            'Change callee…',
            'Duplicate',
            'Add description',
            'Add argument',
            'Open in decision table editor',
            'Open tests',
            'View as code',
            'Remove from flow',
            'Delete',
        ]);
        expect(within(menu).getByText('This node')).toBeInTheDocument();
        expect(within(menu).getByText(/1 caller$/)).toBeInTheDocument();
    });

    it('offers the boxed editor for a func', async () => {
        renderNode('score', {onOpenNode: () => {}});
        await open();
        expect(screen.getByRole('menuitem', {name: 'Open in boxed editor'})).toBeInTheDocument();
    });

    it('routes the open items to the host', async () => {
        const onOpenNode = vi.fn<(target: FlowEditorOpenTarget) => void>();
        renderNode('decision', {onOpenNode});
        await open();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Open tests'}));
        expect(onOpenNode).toHaveBeenLastCalledWith({path: 'risk', kind: 'tests'});
        await open();
        fireEvent.click(screen.getByRole('menuitem', {name: 'View as code'}));
        expect(onOpenNode).toHaveBeenLastCalledWith({path: 'decision', kind: 'code-editor'});
        await open();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Open in decision table editor'}));
        expect(onOpenNode).toHaveBeenLastCalledWith({path: 'risk', kind: 'ruleset'});
    });

    it('keeps only non-mutating items in read-only mode', async () => {
        renderNode('decision', {readOnly: true, onOpenNode: () => {}});
        const menu = await open();
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent),
        ).toEqual(['Open in decision table editor', 'Open tests', 'View as code']);
    });

    it('renames the node', async () => {
        const {service} = renderNode('decision');
        await open();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Rename node'}));
        const input = await screen.findByLabelText('Name of node decision');
        fireEvent.change(input, {target: {value: 'Risk decision'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        await waitFor(() => expect(service.getFunctionNode('decision').label).toBe('Risk decision'));
        expect(await screen.findByText('Risk decision')).toBeInTheDocument();
    });

    it('keeps the field input open on a duplicate name', async () => {
        renderNode('decision');
        await open();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Rename field'}));
        const input = await screen.findByLabelText('Field name of node decision');
        fireEvent.change(input, {target: {value: 'score'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('Change callee opens the picker', async () => {
        renderNode('decision');
        await open();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Change callee…'}));
        expect(await screen.findByLabelText('Search functions and rulesets')).toBeInTheDocument();
    });

    it('adds and removes a description', async () => {
        const {documentation} = renderNode('decision');
        await open();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Add description'}));
        const input = await screen.findByLabelText('Description of decision');
        fireEvent.change(input, {target: {value: 'Risk band'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(documentation.getDescription('decision')).toBe('Risk band');
        await open();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Remove description'}));
        expect(documentation.getDescription('decision')).toBeUndefined();
    });

    it('removes the node from the flow and keeps the field', async () => {
        const {service, mutable} = renderNode('decision');
        await open();
        fireEvent.click(screen.getByRole('menuitem', {name: 'Remove from flow'}));
        expect((mutable.toPortable() as unknown as Record<string, unknown>).decision).toBeDefined();
        expect(service.getFunctionNode('decision').callee?.path).toBe('risk');
    });
});

describe('result rename', () => {
    it('renames a result on click', async () => {
        const {service} = renderNode('decision');
        fireEvent.click(screen.getByRole('button', {name: 'level'}));
        const input = screen.getByLabelText('Rename result level');
        fireEvent.change(input, {target: {value: 'tier'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        await waitFor(() =>
            expect(
                service
                    .getFunctionNode('decision')
                    .results.map((result) => result.name)
                    .sort(),
            ).toEqual(['limit', 'tier']),
        );
    });

    it('Escape cancels the rename', () => {
        const {service} = renderNode('decision');
        fireEvent.click(screen.getByRole('button', {name: 'level'}));
        const input = screen.getByLabelText('Rename result level');
        fireEvent.change(input, {target: {value: 'tier'}});
        fireEvent.keyDown(input, {key: 'Escape'});
        expect(screen.queryByLabelText('Rename result level')).not.toBeInTheDocument();
        expect(service.getFunctionNode('decision').results[0].name).toBe('level');
    });

    it('rejects a duplicate name and keeps the input open', () => {
        renderNode('decision');
        fireEvent.click(screen.getByRole('button', {name: 'level'}));
        const input = screen.getByLabelText('Rename result level');
        fireEvent.change(input, {target: {value: 'limit'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('the unnamed result has no rename input', () => {
        renderNode('payment');
        const node = screen.getByTestId('function-node-payment');
        expect(within(node).queryByRole('button', {name: 'result'})).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Rename result/)).not.toBeInTheDocument();
        fireEvent.click(within(node).getByText('result', {selector: '[class~="locked"]'}));
        expect(screen.queryByLabelText(/Rename result/)).not.toBeInTheDocument();
    });

    it('results are not renamable in read-only mode', () => {
        renderNode('decision', {readOnly: true});
        expect(screen.queryByRole('button', {name: 'level'})).not.toBeInTheDocument();
    });
});
