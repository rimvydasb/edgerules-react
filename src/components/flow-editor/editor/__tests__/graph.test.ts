import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it} from 'vitest';
import {createFlowEditorService} from '../../service/createFlowEditorService';
import {SAMPLE_MODEL} from '../../testing/sampleModel';
import {SERVICE_MODEL} from '../../testing/serviceModel';
import {autoLayout, findFreeSpot, modelWires, outputWires, qualifyBinding, resolveSource} from '../graph';

describe('resolveSource', () => {
    const nodes = new Map<string, {whole?: boolean}>([
        ['applicant', {}],
        ['decision', {whole: false}],
        ['payment', {whole: true}],
    ]);

    it('maps a field path to the output pin of that field', () => {
        expect(resolveSource('applicant.age', nodes)).toEqual({node: 'applicant', handle: 'out:age'});
        expect(resolveSource('decision.level', nodes)).toEqual({node: 'decision', handle: 'out:level'});
    });

    it('maps a whole node to its unnamed return or to the whole-value pin', () => {
        expect(resolveSource('payment', nodes)).toEqual({node: 'payment', handle: 'out:result'});
        expect(resolveSource('applicant', nodes)).toEqual({node: 'applicant', handle: 'out:*'});
    });

    it('has no source for a path off the canvas or deeper than one field', () => {
        expect(resolveSource('application.amount', nodes)).toBeUndefined();
        expect(resolveSource('applicant.address.city', nodes)).toBeUndefined();
        expect(resolveSource('applicantX', nodes)).toBeUndefined();
    });
});

describe('modelWires', () => {
    it('draws one wire per path binding whose source is on the canvas, colored by argument type', () => {
        const service = createFlowEditorService(MutableDecisionService.fromCode(SAMPLE_MODEL));
        service.addInputNode('applicant');
        service.setCallee('decision', 'risk');
        service.setCallee('payment', 'monthly'); // an expression binding: no wire
        const wires = modelWires(service.listNodes(), (field) => service.getFunctionNode(field));
        expect(wires.map((wire) => [wire.id, wire.source, wire.sourceHandle, wire.targetHandle, wire.kind])).toEqual([
            ['decision:age', 'applicant', 'out:age', 'in:age', 'number'],
            ['decision:income', 'applicant', 'out:income', 'in:income', 'number'],
            ['decision:segment', 'applicant', 'out:segment', 'in:segment', 'string'],
        ]);
    });

    it('wires the parameters of a service into its nodes, and its nodes into the fields of its result', () => {
        const service = createFlowEditorService(MutableDecisionService.fromCode(SERVICE_MODEL), {root: 'quote'});
        const wires = modelWires(
            service.listNodes(),
            (field) => service.getFunctionNode(field),
            (field) => service.getResultNode(field),
        );
        expect(wires.map((wire) => [wire.source, wire.sourceHandle, wire.target, wire.targetHandle])).toEqual([
            ['quote.applicant', 'out:age', 'quote.score', 'in:age'],
            ['quote.applicant', 'out:income', 'quote.score', 'in:income'],
            ['quote.amount', 'out:*', 'quote.installment', 'in:amount'],
            ['quote.score', 'out:result', 'quote.return', 'in:score'],
            ['quote.installment', 'out:result', 'quote.return', 'in:installment'],
        ]);
    });

    it('wires every variable of an expression into its one input pin, from the nearest pin of its path', () => {
        const service = createFlowEditorService(
            MutableDecisionService.fromCode(`{
                @InputNode
                applicant: { income: 5000; address: { city: "Vilnius" } }
                rate: 0.2
                tax: applicant.income * rate
                net: applicant.income - tax + tax
                city: applicant.address.city
                unknown: missing.value
            }`),
        );
        const wires = modelWires(
            service.listNodes(),
            (field) => service.getFunctionNode(field),
            (field) => service.getResultNode(field),
            (field) => service.getExpressionNode(field),
        );
        expect(wires.map((wire) => [wire.id, wire.source, wire.sourceHandle, wire.target, wire.targetHandle])).toEqual([
            ['tax:*:applicant.income', 'applicant', 'out:income', 'tax', 'in:*'],
            ['tax:*:rate', 'rate', 'out:*', 'tax', 'in:*'],
            ['net:*:applicant.income', 'applicant', 'out:income', 'net', 'in:*'],
            ['net:*:tax', 'tax', 'out:*', 'net', 'in:*'],
            ['city:*:applicant.address', 'applicant', 'out:address', 'city', 'in:*'],
        ]);
    });

    it('wires the body of a service into its expressions by short names', () => {
        const service = createFlowEditorService(MutableDecisionService.fromCode(SERVICE_MODEL), {root: 'quote'});
        const wires = modelWires(
            service.listNodes(),
            (field) => service.getFunctionNode(field),
            (field) => service.getResultNode(field),
            (field) => service.getExpressionNode(field),
        );
        expect(wires.filter((wire) => wire.target === 'quote.approved').map((wire) => wire.source)).toEqual([
            'quote.score',
        ]);
    });

    it('wires a list input from its one whole-list pin', () => {
        const service = createFlowEditorService(
            MutableDecisionService.fromCode(`{
                type Person: { age: <number> }
                func oldest(people: Person[]): { result: max(for p in people return p.age) }
                @InputNode
                people: [{ age: 30 }, { age: 41 }]
                @FunctionNode
                pick: oldest(people: people)
            }`),
        );
        expect(service.listNodes()).toEqual([
            {field: 'people', kind: 'list-input'},
            {field: 'pick', kind: 'function'},
        ]);
        const wires = modelWires(service.listNodes(), (field) => service.getFunctionNode(field));
        expect(wires.map((wire) => [wire.source, wire.sourceHandle, wire.target, wire.targetHandle])).toEqual([
            ['people', 'out:*', 'pick', 'in:people'],
        ]);
    });
});

describe('qualifyBinding', () => {
    const nodes = new Map([
        ['applicant.profile', {}],
        ['applicant.score', {}],
    ]);

    it('reads a short name of a sibling node in the scope of the field', () => {
        expect(qualifyBinding('profile.tier', 'applicant.score', nodes)).toBe('applicant.profile.tier');
        expect(qualifyBinding('profile', 'applicant.score', nodes)).toBe('applicant.profile');
        expect(qualifyBinding('profile[0]', 'applicant.score', nodes)).toBe('applicant.profile[0]');
    });

    it('keeps a path from the model root and a name that is not a sibling node', () => {
        expect(qualifyBinding('applicant.profile.tier', 'applicant.score', nodes)).toBe('applicant.profile.tier');
        expect(qualifyBinding('income', 'applicant.score', nodes)).toBe('income');
        expect(qualifyBinding('profile.tier', 'score', nodes)).toBe('profile.tier');
    });
});

describe('modelWires in a nested root', () => {
    it('draws the wires of short names and of paths from the model root', () => {
        const mutable = MutableDecisionService.fromCode(`{
            func riskScore(income: number): { score: income / 100 }
            func band(score: number, tier: number): score * tier
            applicant: {
                @InputNode
                profile: { income: 5000; tier: 2 }
                @FunctionNode
                risk: riskScore(income: profile.income)
                @FunctionNode
                level: band(score: risk.score, tier: applicant.profile.tier)
            }
        }`);
        mutable.link();
        const service = createFlowEditorService(mutable, {root: 'applicant'});
        const wires = modelWires(service.listNodes(), (field) => service.getFunctionNode(field));
        expect(wires.map((wire) => [wire.id, wire.source, wire.sourceHandle])).toEqual([
            ['applicant.risk:income', 'applicant.profile', 'out:income'],
            ['applicant.level:score', 'applicant.risk', 'out:score'],
            ['applicant.level:tier', 'applicant.profile', 'out:tier'],
        ]);
    });

    it('draws the wires of a function body root', () => {
        const mutable = MutableDecisionService.fromCode(`{
            func double(x: number): x * 2
            func adjust(rate: number): {
                @InputNode
                base: { amount: 10 }
                @FunctionNode
                doubled: double(x: base.amount)
            }
        }`);
        mutable.link();
        const service = createFlowEditorService(mutable, {root: 'adjust'});
        const wires = modelWires(service.listNodes(), (field) => service.getFunctionNode(field));
        expect(wires.map((wire) => [wire.id, wire.source, wire.sourceHandle])).toEqual([
            ['adjust.doubled:x', 'adjust.base', 'out:amount'],
        ]);
    });
});

describe('outputWires', () => {
    it('keeps only outputs whose source node is on the canvas', () => {
        const wires = outputWires(
            [
                {id: 'output', source: {node: 'decision', handle: 'out:level'}},
                {id: 'output2', source: {node: 'gone', handle: 'out:x'}},
                {id: 'output3'},
            ],
            new Set(['decision']),
        );
        expect(wires).toEqual([
            {
                id: 'output:value',
                source: 'decision',
                sourceHandle: 'out:level',
                target: 'output',
                targetHandle: 'in:value',
                kind: 'any',
            },
        ]);
    });

    it('wires a chart into its data pin', () => {
        const wires = outputWires(
            [{id: 'chart', source: {node: 'schedule', handle: 'out:result'}}],
            new Set(['schedule']),
            'in:data',
        );
        expect(wires).toEqual([
            {
                id: 'chart:data',
                source: 'schedule',
                sourceHandle: 'out:result',
                target: 'chart',
                targetHandle: 'in:data',
                kind: 'any',
            },
        ]);
    });
});

describe('autoLayout', () => {
    const size = {width: 300, height: 200};

    it('puts inputs, then functions by data flow, then outputs in columns', () => {
        const positions = autoLayout(
            [
                {id: 'out', kind: 'output', ...size},
                {id: 'second', kind: 'function', ...size},
                {id: 'first', kind: 'function', ...size},
                {id: 'in', kind: 'object-input', ...size},
            ],
            [
                {source: 'in', target: 'first'},
                {source: 'first', target: 'second'},
                {source: 'second', target: 'out'},
            ],
        );
        expect(positions).toEqual({
            in: {x: 0, y: 0},
            first: {x: 420, y: 0},
            second: {x: 840, y: 0},
            out: {x: 1260, y: 0},
        });
    });

    it('stacks the nodes of one column with a gap', () => {
        const positions = autoLayout(
            [
                {id: 'a', kind: 'object-input', width: 200, height: 160},
                {id: 'b', kind: 'list-input', width: 200, height: 120},
            ],
            [],
        );
        expect(positions).toEqual({a: {x: 0, y: 0}, b: {x: 0, y: 200}});
    });

    it('puts an unwired output after the last column and survives a cycle', () => {
        const positions = autoLayout(
            [
                {id: 'f', kind: 'function', ...size},
                {id: 'g', kind: 'function', ...size},
                {id: 'out', kind: 'output', ...size},
            ],
            [
                {source: 'f', target: 'g'},
                {source: 'g', target: 'f'},
            ],
        );
        expect(positions.out.x).toBeGreaterThan(Math.max(positions.f.x, positions.g.x));
    });

    it('puts a chart one column after its source, as an output', () => {
        const positions = autoLayout(
            [
                {id: 'in', kind: 'object-input', ...size},
                {id: 'f', kind: 'function', ...size},
                {id: 'chart', kind: 'chart', width: 440, height: 340},
                {id: 'idle', kind: 'chart', width: 440, height: 340},
            ],
            [
                {source: 'in', target: 'f'},
                {source: 'f', target: 'chart'},
            ],
        );
        expect(positions.chart).toEqual({x: 840, y: 0});
        // An unwired chart goes after the last column, below the wired one.
        expect(positions.idle).toEqual({x: 840, y: 380});
    });
});

describe('findFreeSpot', () => {
    it('keeps a free spot, snapped to the grid', () => {
        expect(findFreeSpot({x: 13, y: 27}, {width: 100, height: 100}, [])).toEqual({x: 20, y: 20});
    });

    it('moves below a node in the way', () => {
        const spot = findFreeSpot({x: 0, y: 0}, {width: 100, height: 100}, [{x: 0, y: 0, width: 200, height: 200}]);
        expect(spot).toEqual({x: 0, y: 240});
    });
});
