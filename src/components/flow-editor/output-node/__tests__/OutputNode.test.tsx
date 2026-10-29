import {MutableDecisionService} from '@edgerules/node/mutable';
import {ReactFlow, ReactFlowProvider, type Edge} from '@xyflow/react';
import {render, screen, waitFor, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {FlowEditorProvider} from '../../FlowEditorProvider';
import {FunctionNode} from '../../function-node/FunctionNode';
import {createFlowEditorService} from '../../service/createFlowEditorService';
import {SAMPLE_MODEL} from '../../testing/sampleModel';
import {OutputNode, formatValue, sourcePath} from '../OutputNode';

const nodeTypes = {functionNode: FunctionNode, outputNode: OutputNode};

// The sample model with results that are lists: of records, and of numbers.
const MODEL = SAMPLE_MODEL.replace(
    /}$/,
    `  func tiers(base: number): [{ name: "prime"; limit: base }, { name: "standard"; limit: base * 2 }]
  func sequence(start: number): [start, start + 1, start + 2]
  rows: tiers(base: 1000)
  numbers: sequence(start: 1)
}`,
);

function renderOutput(wire?: {source: string; handle: string}) {
    const mutable = MutableDecisionService.fromCode(MODEL);
    const service = createFlowEditorService(mutable);
    const edges: Edge[] = wire
        ? [{id: 'wire', source: wire.source, sourceHandle: wire.handle, target: 'out', targetHandle: 'in:value'}]
        : [];
    render(
        <ReactFlowProvider>
            <FlowEditorProvider service={service}>
                <div style={{width: 800, height: 600}}>
                    <ReactFlow
                        nodes={[
                            {id: 'decision', type: 'functionNode', position: {x: 0, y: 0}, data: {field: 'decision'}},
                            {id: 'payment', type: 'functionNode', position: {x: 0, y: 300}, data: {field: 'payment'}},
                            {id: 'rows', type: 'functionNode', position: {x: 0, y: 600}, data: {field: 'rows'}},
                            {id: 'numbers', type: 'functionNode', position: {x: 0, y: 900}, data: {field: 'numbers'}},
                            {id: 'out', type: 'outputNode', position: {x: 500, y: 0}, data: {}, width: 200, height: 80},
                        ]}
                        edges={edges}
                        nodeTypes={nodeTypes}
                    />
                </div>
            </FlowEditorProvider>
        </ReactFlowProvider>,
    );
    return {service, mutable};
}

describe('OutputNode', () => {
    it('shows a dash while nothing is wired', () => {
        renderOutput();
        expect(screen.getByTestId('output-value')).toHaveTextContent('—');
    });

    it('shows the engine value of the wired result', async () => {
        renderOutput({source: 'decision', handle: 'out:level'});
        await waitFor(() => expect(screen.getByTestId('output-value')).toHaveTextContent("'high'"));
        expect(screen.getByTestId('output-node-out')).toHaveTextContent('decision.level');
    });

    it('shows the value of an unnamed result', async () => {
        renderOutput({source: 'payment', handle: 'out:result'});
        await waitFor(() => expect(screen.getByTestId('output-value')).toHaveTextContent('2933.33'));
    });

    it('reads again after a change of the model', async () => {
        const {service} = renderOutput({source: 'decision', handle: 'out:level'});
        await waitFor(() => expect(screen.getByTestId('output-value')).toHaveTextContent("'high'"));
        service.renameField('decision', 'verdict'); // the wire still reads decision.level, which is gone now
        expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows a list of records as a table under the value row', async () => {
        renderOutput({source: 'rows', handle: 'out:result'});
        const table = await screen.findByTestId('output-table');
        expect(screen.getByTestId('output-node-out')).toHaveAttribute('data-shape', 'table');
        expect(screen.getByTestId('output-value')).toHaveTextContent('2 rows × 2 columns');
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((cell) => cell.textContent),
        ).toEqual(['#', 'name', 'limit']);
        expect(within(table).getAllByRole('row')).toHaveLength(3);
        expect(within(table).getByText('prime')).toBeInTheDocument();
    });

    it('shows a record as a table of fields', async () => {
        renderOutput({source: 'decision', handle: 'out:*'});
        const table = await screen.findByTestId('output-table');
        expect(screen.getByTestId('output-value')).toHaveTextContent('2 fields');
        expect(within(table).getByRole('rowheader', {name: 'level'})).toBeInTheDocument();
        expect(within(table).getByText('high')).toBeInTheDocument();
    });

    it('shows a list of values as a numbered list', async () => {
        renderOutput({source: 'numbers', handle: 'out:result'});
        const table = await screen.findByTestId('output-table');
        expect(screen.getByTestId('output-value')).toHaveTextContent('3 items');
        expect(
            within(table)
                .getAllByRole('rowheader')
                .map((cell) => cell.textContent),
        ).toEqual(['1', '2', '3']);
    });

    it('shows the error row when the wired path does not exist', async () => {
        renderOutput({source: 'decision', handle: 'out:missing'});
        expect(await screen.findByRole('alert')).toHaveTextContent('no decision.missing');
    });
});

describe('OutputNode helpers', () => {
    it('maps pins to model paths', () => {
        const service = createFlowEditorService(
            MutableDecisionService.fromCode(
                SAMPLE_MODEL.replace(
                    /}$/,
                    `  func halve(amount: number): { result: amount / 2; rest: amount / 2 }
  halves: halve(amount: 10)
}`,
                ),
            ),
        );
        service.setCallee('decision', 'risk');
        service.setCallee('payment', 'monthly');
        service.setCallee('halves', 'halve');
        expect(sourcePath(service, 'decision', 'out:level')).toBe('decision.level');
        expect(sourcePath(service, 'decision', 'out:*')).toBe('decision');
        // The unnamed return is the whole value; a record field named `result` is that field.
        expect(sourcePath(service, 'payment', 'out:result')).toBe('payment');
        expect(sourcePath(service, 'halves', 'out:result')).toBe('halves.result');
    });

    it('quotes strings only', () => {
        expect(formatValue('high')).toBe("'high'");
        expect(formatValue(5)).toBe('5');
        expect(formatValue([1, 2])).toBe('[1,2]');
    });
});

describe('FlowEditorService.readOutput', () => {
    it('evaluates fields and paths into results', async () => {
        const service = createFlowEditorService(MutableDecisionService.fromCode(SAMPLE_MODEL));
        expect(await service.readOutput('decision.limit')).toEqual({value: 1000, type: 'number'});
        expect(await service.readOutput('decision.level')).toEqual({value: 'high', type: 'string'});
        expect(await service.readOutput('applicant.nope')).toEqual({error: 'no applicant.nope'});
    });
});
