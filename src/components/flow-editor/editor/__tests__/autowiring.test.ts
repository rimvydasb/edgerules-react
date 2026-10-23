import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it} from 'vitest';
import {createFlowEditorService} from '../../service/createFlowEditorService';
import {modelWires, outputWires} from '../graph';

const FUNCTIONS = `
    func score(age: number, income: number): age * 2 + income / 1000
    func limitFor(points: number, segment: string): { limit: points * 10, tier: segment }
    func net(gross: number, tax: number): gross - tax
    func label(tier: string): tier`;

function wiresOf(nodes: string) {
    const service = createFlowEditorService(MutableDecisionService.fromCode(`{${FUNCTIONS}\n${nodes}\n}`) as never);
    const refs = service.listNodes();
    const wires = modelWires(refs, (field) => service.getFunctionNode(field));
    return {
        service,
        refs,
        wires,
        summary: wires.map((w) => `${w.source}.${w.sourceHandle}->${w.target}.${w.targetHandle}`),
    };
}

const NODES = (call: (name: string, args: string[], named: string[]) => string) => `
    @InputNode
    applicant: { age: 30, income: 40000, segment: "retail" }
    @InputNode
    payroll: { gross: 5000, tax: 800 }
    @FunctionNode
    points: ${call('score', ['applicant.age', 'applicant.income'], ['age: applicant.age', 'income: applicant.income'])}
    @FunctionNode
    credit: ${call('limitFor', ['points', 'applicant.segment'], ['points: points', 'segment: applicant.segment'])}
    @FunctionNode
    pay: ${call('net', ['payroll.gross', 'payroll.tax'], ['gross: payroll.gross', 'tax: payroll.tax'])}
    @FunctionNode
    badge: ${call('label', ['credit.tier'], ['tier: credit.tier'])}`;

const EXPECTED = [
    'applicant.out:age->points.in:age',
    'applicant.out:income->points.in:income',
    'points.out:result->credit.in:points',
    'applicant.out:segment->credit.in:segment',
    'payroll.out:gross->pay.in:gross',
    'payroll.out:tax->pay.in:tax',
    'credit.out:tier->badge.in:tier',
];

describe('autowiring of a multi-node model', () => {
    it('wires every positional argument to its source node and pin', () => {
        const {summary} = wiresOf(NODES((name, args) => `${name}(${args.join(', ')})`));
        expect([...summary].sort()).toEqual([...EXPECTED].sort());
    });

    it('wires every named argument identically', () => {
        const {summary} = wiresOf(NODES((name, _args, named) => `${name}(${named.join(', ')})`));
        expect([...summary].sort()).toEqual([...EXPECTED].sort());
    });

    it('wires named arguments given in a different order than the parameters', () => {
        const {summary} = wiresOf(NODES((name, _args, named) => `${name}(${[...named].reverse().join(', ')})`));
        expect([...summary].sort()).toEqual([...EXPECTED].sort());
    });

    it('colors each wire by the type of its parameter and gives it a unique id', () => {
        const {wires} = wiresOf(NODES((name, args) => `${name}(${args.join(', ')})`));
        expect(wires.find((w) => w.id === 'credit:segment')?.kind).toBe('string');
        expect(wires.find((w) => w.id === 'credit:points')?.kind).toBe('number');
        expect(new Set(wires.map((w) => w.id)).size).toBe(wires.length);
    });

    it('draws no wire for an expression or literal argument, but keeps the others', () => {
        const {summary} = wiresOf(`
            @InputNode
            applicant: { age: 30, income: 40000, segment: "retail" }
            @FunctionNode
            points: score(applicant.age, applicant.income * 2)
            @FunctionNode
            other: score(40, applicant.income)`);
        expect([...summary].sort()).toEqual([
            'applicant.out:age->points.in:age',
            'applicant.out:income->other.in:income',
        ]);
    });

    it('wires an argument that reads a whole input record', () => {
        const {summary} = wiresOf(`
            @InputNode
            applicant: { age: 30, income: 40000, segment: "retail" }
            type Person: { age: <number> }
            func describe(person: Person): person.age
            @FunctionNode
            text: describe(applicant)`);
        expect(summary).toEqual(['applicant.out:*->text.in:person']);
    });

    it('reports each argument binding on the node model', () => {
        const {service} = wiresOf(NODES((name, args) => `${name}(${args.join(', ')})`));
        expect(service.getFunctionNode('credit').arguments.map((a) => [a.name, a.binding?.text])).toEqual([
            ['points', 'points'],
            ['segment', 'applicant.segment'],
        ]);
    });

    it('wires multiple outputs from different nodes and pins to their sources', () => {
        const {refs} = wiresOf(NODES((name, args) => `${name}(${args.join(', ')})`));
        const wires = outputWires(
            [
                {id: 'out1', source: {node: 'credit', handle: 'out:limit'}},
                {id: 'out2', source: {node: 'pay', handle: 'out:result'}},
                {id: 'out3', source: {node: 'badge', handle: 'out:result'}},
                {id: 'out4', source: {node: 'applicant', handle: 'out:*'}},
                {id: 'out5'}, // unconnected
                {id: 'out6', source: {node: 'removed', handle: 'out:x'}}, // source left the canvas
            ],
            new Set(refs.map((ref) => ref.field)),
        );
        expect(wires.map((w) => `${w.source}.${w.sourceHandle}->${w.target}.${w.targetHandle}`)).toEqual([
            'credit.out:limit->out1.in:value',
            'pay.out:result->out2.in:value',
            'badge.out:result->out3.in:value',
            'applicant.out:*->out4.in:value',
        ]);
    });
});
