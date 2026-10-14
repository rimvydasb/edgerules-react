import {MutableDecisionService} from '@edgerules/node/mutable';
import {ReactFlow, ReactFlowProvider} from '@xyflow/react';
import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {createDocumentationService} from '../../documentation-service';
import {FlowEditorProvider} from '../FlowEditorProvider';
import {FunctionNode} from '../function-node/FunctionNode';
import {createFlowEditorService} from '../service/createFlowEditorService';
import {SAMPLE_MODEL} from './sampleModel';

const nodeTypes = {functionNode: FunctionNode};

function renderNode(field: string, options: {model?: string; draft?: boolean} = {}) {
    const mutable = MutableDecisionService.fromCode(options.model ?? SAMPLE_MODEL);
    const service = createFlowEditorService(mutable);
    const documentation = createDocumentationService(`fn-${Math.random()}`);
    const nodeField = options.draft ? service.createDraftNode() : field;
    render(
        <ReactFlowProvider>
            <FlowEditorProvider service={service} documentation={documentation}>
                <div style={{width: 800, height: 600}}>
                    <ReactFlow
                        nodes={[
                            {
                                id: nodeField,
                                type: 'functionNode',
                                position: {x: 0, y: 0},
                                data: {field: nodeField},
                                width: 400,
                                height: 300,
                            },
                        ]}
                        edges={[]}
                        nodeTypes={nodeTypes}
                    />
                </div>
            </FlowEditorProvider>
        </ReactFlowProvider>,
    );
    return {service, documentation, mutable, field: nodeField};
}

describe('FunctionNode', () => {
    it('reads ARGUMENTS and RESULTS in the plural and ARGUMENT and RESULT in the singular', () => {
        renderNode('decision');
        const node = screen.getByTestId('function-node-decision');
        expect(within(node).getByText('arguments')).toBeInTheDocument();
        expect(within(node).getByText('results')).toBeInTheDocument();
    });

    it('uses the singular for one argument and one result', () => {
        renderNode('payment');
        const node = screen.getByTestId('function-node-payment');
        expect(within(node).getByText('argument')).toBeInTheDocument();
        // The band and the unnamed result row both read "result".
        expect(within(node).getAllByText('result')).toHaveLength(2);
        expect(within(node).queryByText('results')).not.toBeInTheDocument();
    });

    it('shows the callee, the return type and one row per argument and result', () => {
        renderNode('decision');
        const node = screen.getByTestId('function-node-decision');
        expect(within(node).getByRole('button', {name: 'Callee risk'})).toBeInTheDocument();
        expect(node.querySelector('[class~="retType"]')).toHaveTextContent('→ { level, limit }');
        for (const name of ['age', 'income', 'segment', 'level', 'limit']) {
            expect(within(node).getByText(name)).toBeInTheDocument();
        }
    });

    it('renders no binding text and no value text', () => {
        renderNode('decision');
        const text = screen.getByTestId('function-node-decision').textContent ?? '';
        expect(text).not.toContain('applicant.');
        expect(text).not.toContain('retail');
        expect(text).not.toContain('25000');
    });

    it('renders no expression text for a value binding either', () => {
        renderNode('payment');
        expect(screen.getByTestId('function-node-payment').textContent).not.toContain('1.1');
    });

    it('puts the binding text in the pin tooltip', () => {
        renderNode('decision');
        const pin = document.querySelector('[data-handleid="in:age"]');
        expect(pin).toHaveAttribute('title', 'age : number ← applicant.age');
    });

    it('creates handles with the documented ids', () => {
        renderNode('decision');
        const ids = [...document.querySelectorAll('[data-handleid]')].map((element) =>
            element.getAttribute('data-handleid'),
        );
        expect(ids.sort()).toEqual(['in:age', 'in:income', 'in:segment', 'out:*', 'out:level', 'out:limit']);
    });

    it('shows no draft badge for a committed node', () => {
        renderNode('decision');
        expect(screen.queryByText('draft')).not.toBeInTheDocument();
    });

    it('shows the draft badge when a required argument is unbound', () => {
        const {service, field} = renderNode('decision', {draft: true});
        service.setCallee(field, 'risk');
        service.bindArgument(field, 'age', 'applicant.age');
        return waitFor(() => expect(screen.getByText('draft')).toBeInTheDocument());
    });

    it('marks an unbound argument pin with the error color class', async () => {
        const {service, field} = renderNode('decision', {draft: true});
        service.setCallee(field, 'risk');
        service.bindArgument(field, 'age', 'applicant.age');
        await waitFor(() => expect(document.querySelector('[data-handleid="in:income"]')).toHaveClass('pinBad'));
        expect(document.querySelector('[data-handleid="in:age"]')).not.toHaveClass('pinBad');
    });

    it('shows the empty state and no draft badge for a node without a callee', () => {
        renderNode('decision', {draft: true});
        expect(screen.getByRole('button', {name: 'Select callee'})).toBeInTheDocument();
        expect(screen.getByText(/Pick a function or ruleset/)).toBeInTheDocument();
        expect(screen.queryByText('draft')).not.toBeInTheDocument();
    });

    it('shows the unnamed return of a func as a locked result', () => {
        renderNode('payment');
        const locked = screen.getByTestId('function-node-payment').querySelector('[class~="locked"]');
        expect(locked).toHaveTextContent('result');
    });

    it('shows the description under the header', async () => {
        const {documentation} = renderNode('decision');
        documentation.setDescription('decision', 'Assess the applicant risk band');
        expect(await screen.findByText('Assess the applicant risk band')).toBeInTheDocument();
    });

    it('shows an error message on the pin row of a rejected binding', async () => {
        const {service} = renderNode('decision');
        service.bindArgument('decision', 'segment', 'applicant.age');
        expect(await screen.findByRole('alert')).toHaveTextContent(/type mismatch/);
    });
});

describe('CalleePicker', () => {
    it('lists only the user callables, grouped by kind', async () => {
        renderNode('decision');
        fireEvent.click(screen.getByRole('button', {name: 'Callee risk'}));
        const options = await screen.findAllByRole('option');
        expect(options.map((option) => option.textContent).sort()).toEqual([
            'applicantDecision(person) → { eligible, reason }',
            'creditScore(age, income) → number',
            'monthly(amount) → number',
            'risk(age, income, segment) → { level, limit }✓',
        ]);
        expect(screen.getByText('Functions')).toBeInTheDocument();
        expect(screen.getByText('Rulesets')).toBeInTheDocument();
    });

    it('filters by the search text', async () => {
        renderNode('decision');
        fireEvent.click(screen.getByRole('button', {name: 'Callee risk'}));
        fireEvent.change(await screen.findByLabelText('Search functions and rulesets'), {target: {value: 'month'}});
        expect(screen.getAllByRole('option')).toHaveLength(1);
        expect(screen.getByRole('option')).toHaveTextContent('monthly');
    });

    it('sets the callee through the service', async () => {
        const {service} = renderNode('score');
        fireEvent.click(screen.getByRole('button', {name: 'Callee creditScore'}));
        fireEvent.click(await screen.findByRole('option', {name: /^monthly/}));
        await waitFor(() => expect(service.getFunctionNode('score').callee?.path).toBe('monthly'));
    });
});
