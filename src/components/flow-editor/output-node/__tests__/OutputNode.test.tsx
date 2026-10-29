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

// The sample model with results that are lists: of records, of numbers, longer and wider than the node shows, and
// an empty list of typed records.
const MODEL = SAMPLE_MODEL.replace(
    /}$/,
    `  type Task: { worker: <number>; startsAt: <string> }
  func tiers(base: number): [{ name: "prime"; limit: base }, { name: "standard"; limit: base * 2 }]
  func sequence(start: number): [start, start + 1, start + 2]
  func counting(count: number): for i in 1..count return i
  func wideRows(base: number): [{ a: base; b: 2; c: 3; d: 4; e: 5; f: 6; g: 7 }]
  func noTasks(base: number): { tasks: <Task[], []> }
  rows: tiers(base: 1000)
  numbers: sequence(start: 1)
  many: counting(count: 12)
  wide: wideRows(base: 1)
  idle: noTasks(base: 1)
}`,
);
const SOURCES = ['decision', 'payment', 'rows', 'numbers', 'many', 'wide', 'idle'];

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
                            ...SOURCES.map((field, index) => ({
                                id: field,
                                type: 'functionNode',
                                position: {x: 0, y: index * 300},
                                data: {field},
                            })),
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

    it('shows at most 10 rows and ends a longer list with a … row', async () => {
        renderOutput({source: 'many', handle: 'out:result'});
        const table = await screen.findByTestId('output-table');
        expect(screen.getByTestId('output-value')).toHaveTextContent('12 items');
        expect(within(table).getAllByRole('rowheader')).toHaveLength(10);
        expect(within(table).getByTestId('output-more-rows')).toHaveTextContent('……');
    });

    it('shows at most 5 value columns and ends a wider table with a … column', async () => {
        renderOutput({source: 'wide', handle: 'out:result'});
        const table = await screen.findByTestId('output-table');
        expect(screen.getByTestId('output-value')).toHaveTextContent('1 row × 7 columns');
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((cell) => cell.textContent),
        ).toEqual(['#', 'a', 'b', 'c', 'd', 'e', '…']);
        expect(within(table).queryByTestId('output-more-rows')).toBeNull();
    });

    it('shows an empty list of records with the columns of its type and an Empty row', async () => {
        renderOutput({source: 'idle', handle: 'out:tasks'});
        const table = await screen.findByTestId('output-table');
        expect(screen.getByTestId('output-value')).toHaveTextContent('0 rows × 2 columns');
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((cell) => cell.textContent)
                .sort(),
        ).toEqual(['#', 'startsAt', 'worker']);
        expect(within(table).getByRole('cell')).toHaveTextContent('Empty');
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

    it('names the item fields of an empty list of records from its declared type', async () => {
        const service = createFlowEditorService(MutableDecisionService.fromCode(MODEL));
        const reading = await service.readOutput('idle.tasks');
        expect(reading).toMatchObject({value: []});
        expect('columns' in reading && reading.columns?.sort()).toEqual(['startsAt', 'worker']);
    });
});
