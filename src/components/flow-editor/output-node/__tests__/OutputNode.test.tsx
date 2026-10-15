import {MutableDecisionService} from '@edgerules/node/mutable';
import {ReactFlow, ReactFlowProvider, type Edge} from '@xyflow/react';
import {render, screen, waitFor} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {FlowEditorProvider} from '../../FlowEditorProvider';
import {FunctionNode} from '../../function-node/FunctionNode';
import {createFlowEditorService} from '../../service/createFlowEditorService';
import {SAMPLE_MODEL} from '../../testing/sampleModel';
import {OutputNode, formatValue, sourcePath} from '../OutputNode';

const nodeTypes = {functionNode: FunctionNode, outputNode: OutputNode};

function renderOutput(wire?: {source: string; handle: string}) {
    const mutable = MutableDecisionService.fromCode(SAMPLE_MODEL);
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

    it('shows the error row when the wired path does not exist', async () => {
        renderOutput({source: 'decision', handle: 'out:missing'});
        expect(await screen.findByRole('alert')).toHaveTextContent('no decision.missing');
    });
});

describe('OutputNode helpers', () => {
    it('maps pins to model paths', () => {
        expect(sourcePath('decision', 'out:level')).toBe('decision.level');
        expect(sourcePath('decision', 'out:*')).toBe('decision');
        expect(sourcePath('payment', 'out:result')).toBe('payment');
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
