import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it} from 'vitest';
import {isPortableError} from '#lib/portable';
import {createFlowEditorService} from '../service/createFlowEditorService';
import {SERVICE_MODEL} from '../testing/serviceModel';

function build(model = SERVICE_MODEL, root = 'quote') {
    const mutable = MutableDecisionService.fromCode(model);
    return {mutable, service: createFlowEditorService(mutable, {root})};
}

const body = (mutable: MutableDecisionService) =>
    (mutable.toPortable() as unknown as Record<string, {'@body': Record<string, unknown>}>).quote['@body'];

describe('FlowEditorService of a service', () => {
    it('lists the parameters first, then the function nodes and the result', () => {
        const {service} = build();
        expect(service.isService()).toBe(true);
        expect(service.listNodes()).toEqual([
            {field: 'quote.applicant', kind: 'parameter'},
            {field: 'quote.amount', kind: 'parameter'},
            {field: 'quote.score', kind: 'function'},
            {field: 'quote.installment', kind: 'function'},
            {field: 'quote.approved', kind: 'expression'},
            {field: 'quote.return', kind: 'result'},
        ]);
    });

    it('is not a service flow at the model root or at a plain function', () => {
        expect(build(SERVICE_MODEL, '*').service.isService()).toBe(false);
        expect(build(SERVICE_MODEL, 'monthly').service.isService()).toBe(false);
    });

    describe('parameter nodes', () => {
        it('reads a record parameter from its type definition, with no value', () => {
            const {service} = build();
            expect(service.getParameterNode('quote.applicant')).toEqual({
                field: 'quote.applicant',
                name: 'applicant',
                type: 'Applicant',
                typePath: 'Applicant',
                fields: [
                    {name: 'age', type: 'number'},
                    {name: 'income', type: 'number'},
                ],
                used: true,
                exists: true,
            });
            expect(service.getParameterNode('quote.amount')).toMatchObject({type: 'number', fields: [], used: true});
            expect(service.getParameterNode('quote.missing')).toMatchObject({exists: false});
        });

        it('wires a record field into a function node by its short name', () => {
            const {service} = build();
            expect(service.getFunctionNode('quote.score').arguments.map((argument) => argument.binding)).toEqual([
                {kind: 'path', text: 'applicant.age'},
                {kind: 'path', text: 'applicant.income'},
            ]);
            expect(service.bindArgument('quote.installment', 'amount', 'quote.applicant.income')).toBeUndefined();
            expect(service.getFunctionNode('quote.installment').arguments[0].binding).toEqual({
                kind: 'path',
                text: 'applicant.income',
            });
        });

        it('adds a number parameter to a service without callers', () => {
            const {service, mutable} = build(`{ @Service func f(a: number): { r: a } }`, 'f');
            expect(service.createParameter()).toBe('f.param');
            expect(service.listNodes().map((node) => node.field)).toContain('f.param');
            expect(mutable.get('f')).toMatchObject({'@parameters': {a: 'number', param: 'number'}, '@node': 'Service'});
        });

        it('refuses a new parameter that a caller does not pass', () => {
            const {service, mutable} = build();
            expect(isPortableError(service.createParameter())).toBe(true);
            expect(Object.keys((mutable.get('quote') as {'@parameters': object})['@parameters'])).toEqual([
                'applicant',
                'amount',
            ]);
        });

        it('renames a parameter in the body and at every call site', async () => {
            const {service, mutable} = build();
            expect(service.renameParameter('quote.applicant', 'person')).toBeUndefined();
            expect(service.listNodes()[0]).toEqual({field: 'quote.person', kind: 'parameter'});
            expect(service.getFunctionNode('quote.score').arguments[0].binding).toEqual({
                kind: 'path',
                text: 'person.age',
            });
            // The `@Service` annotation and the named argument of the caller follow.
            expect(mutable.get('quote')).toMatchObject({'@node': 'Service'});
            expect(mutable.getCode('offer')).toContain('quote(person:');
            expect(await mutable.execute('offer')).toBe(100);
        });

        it('refuses an invalid or taken parameter name', () => {
            const {service} = build();
            expect(service.renameParameter('quote.applicant', '1x')).toMatchObject({'@kind': 'error'});
            expect(service.renameParameter('quote.applicant', 'amount')).toMatchObject({type: 'DuplicateName'});
            expect(service.renameParameter('quote.applicant', 'score')).toMatchObject({type: 'DuplicateName'});
        });

        it('changes the type of a parameter, link-checked', () => {
            const {service} = build(`{ @Service func f(a: number, b: number): { r: b } }`, 'f');
            expect(service.setParameterType('f.a', 'string')).toBeUndefined();
            expect(service.getParameterNode('f.a').type).toBe('string');
            // `b * 1` needs a number.
            expect(service.setParameterType('f.b', 'Unknown')).toMatchObject({'@kind': 'error'});
            expect(service.getParameterNode('f.b').type).toBe('number');
        });

        it('deletes an unused parameter from the service and its calls; a used one stays', async () => {
            const model = `{
  @Service
  func f(a: number, unused: number): { r: a }
  @FunctionNode
  call: f(a: 1, unused: 2)
}`;
            const {service, mutable} = build(model, 'f');
            expect(service.deleteField('f.a')).toMatchObject({'@kind': 'error', message: "'a' is read by 'f'"});
            expect(service.deleteField('f.unused')).toBeUndefined();
            expect(mutable.getCode('call')).not.toContain('unused');
            expect(await mutable.execute('call')).toEqual({r: 1});
        });

        it('is always on the flow of its service', () => {
            const {service} = build();
            expect(service.removeFromFlow('quote.amount')).toMatchObject({'@kind': 'error'});
        });
    });

    describe('the result node', () => {
        it('reads the fields of the result with their expressions and types', () => {
            const {service} = build();
            expect(service.getResultNode('quote.return')).toEqual({
                field: 'quote.return',
                label: 'Quote',
                fields: [
                    {name: 'score', type: 'number', value: 'score'},
                    {name: 'installment', type: 'number', value: 'installment'},
                ],
                exists: true,
            });
        });

        it('adds a wired value as a new field named after it, and the service returns it', async () => {
            const {service, mutable} = build();
            expect(service.bindResultField('quote.return', undefined, 'quote.applicant.income')).toBeUndefined();
            expect(service.getResultNode('quote.return').fields.at(-1)).toEqual({
                name: 'income',
                type: 'number',
                value: 'applicant.income',
            });
            expect(await mutable.execute('quote', {applicant: {age: 30, income: 40000}, amount: 1200})).toMatchObject({
                income: 40000,
            });
        });

        it('names a new field uniquely and rebinds an existing one', () => {
            const {service} = build();
            service.bindResultField('quote.return', undefined, 'quote.score');
            expect(service.getResultNode('quote.return').fields.map((item) => item.name)).toEqual([
                'score',
                'installment',
                'score2',
            ]);
            expect(service.bindResultField('quote.return', 'score2', 'quote.applicant.age')).toBeUndefined();
            expect(service.getResultNode('quote.return').fields[2]).toMatchObject({value: 'applicant.age'});
        });

        it('refuses to remove or rename a field that a caller reads', () => {
            const {service} = build();
            expect(service.removeResultField('quote.return', 'installment')).toMatchObject({'@kind': 'error'});
            expect(service.renameResultField('quote.return', 'installment', 'monthly')).toMatchObject({
                '@kind': 'error',
            });
            expect(service.removeResultField('quote.return', 'score')).toBeUndefined();
            expect(service.getResultNode('quote.return').fields.map((item) => item.name)).toEqual(['installment']);
        });

        it('moves a field and edits its expression', () => {
            const {service} = build();
            service.moveResultField('quote.return', 'installment', 'up');
            expect(service.getResultNode('quote.return').fields.map((item) => item.name)).toEqual([
                'installment',
                'score',
            ]);
            expect(service.setResultFieldValue('quote.return', 'score', 'score * 2')).toBeUndefined();
            expect(service.setResultFieldValue('quote.return', 'score', 'nothing')).toMatchObject({'@kind': 'error'});
            expect(service.getResultNode('quote.return').fields[1].value).toBe('score * 2');
        });

        it('renames the node and leaves the flow without the record leaving the model', () => {
            const {service, mutable} = build();
            service.setNodeName('quote.return', 'Offer');
            expect(service.getResultNode('quote.return').label).toBe('Offer');
            expect(service.removeFromFlow('quote.return')).toBeUndefined();
            expect(service.listNodes().map((node) => node.kind)).not.toContain('result');
            expect(body(mutable).return).toMatchObject({'@kind': 'context', score: {expression: 'score'}});
        });

        it('creates the result with every value the service returns now, so callers keep linking', async () => {
            const model = `{
  func monthly(amount: number): amount / 12
  @Service
  func f(amount: number): {
    @FunctionNode
    installment: monthly(amount: amount)
    total: amount * 2
  }
  use: f(amount: 120).total
}`;
            const {service, mutable} = build(model, 'f');
            expect(service.createResultNode()).toBe('f.return');
            expect(service.getResultNode('f.return').fields.map((item) => [item.name, item.value])).toEqual([
                ['installment', 'installment'],
                ['total', 'total'],
            ]);
            expect(await mutable.execute('use')).toBe(240);
        });

        it('annotates an existing return record', () => {
            const {service} = build(`{ @Service func f(a: number): { b: a; return: { b: b } } }`, 'f');
            expect(service.listNodes().map((node) => node.kind)).toEqual(['parameter', 'expression']);
            expect(service.createResultNode()).toBe('f.return');
            expect(service.listNodes().map((node) => node.kind)).toEqual(['parameter', 'expression', 'result']);
        });
    });
});

describe('FlowEditorService of a service: expression nodes', () => {
    it('shows each expression of the body and reads its variables by their short names', () => {
        const {service} = build();
        expect(service.getExpressionNode('quote.approved')).toEqual({
            field: 'quote.approved',
            // A function body is not linked as a data context: the engine infers no type.
            type: 'any',
            expression: 'score > 350',
            variables: ['score'],
        });
    });

    it('shows a `return` expression as an expression node, not as the result', () => {
        const {service} = build(`{ @Service func f(a: number): { b: a * 2; return: b + 1 } }`, 'f');
        expect(service.listNodes()).toEqual([
            {field: 'f.a', kind: 'parameter'},
            {field: 'f.b', kind: 'expression'},
            {field: 'f.return', kind: 'expression'},
        ]);
        expect(service.getExpressionNode('f.return').variables).toEqual(['b']);
    });
});
