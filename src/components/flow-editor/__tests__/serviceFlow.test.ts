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
    it('lists the parameters first, then the function nodes and the return', () => {
        const {service} = build();
        expect(service.isService()).toBe(true);
        expect(service.listNodes()).toEqual([
            {field: 'quote.applicant', kind: 'parameter'},
            {field: 'quote.amount', kind: 'parameter'},
            {field: 'quote.score', kind: 'function'},
            {field: 'quote.installment', kind: 'function'},
            {field: 'quote.approved', kind: 'expression'},
            {field: 'quote.return', kind: 'return'},
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

    describe('the return node', () => {
        it('reads the fields of the return context with their expressions and types', () => {
            const {service} = build();
            expect(service.getReturnNode('quote.return')).toEqual({
                field: 'quote.return',
                label: 'Quote',
                fields: [
                    {name: 'score', type: 'number', value: 'score'},
                    {name: 'installment', type: 'number', value: 'installment'},
                ],
                variables: [],
                exists: true,
            });
        });

        it('adds a wired value as a new field named after it, and the service returns it', async () => {
            const {service, mutable} = build();
            expect(service.bindReturnField('quote.return', undefined, 'quote.applicant.income')).toBeUndefined();
            expect(service.getReturnNode('quote.return').fields.at(-1)).toEqual({
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
            service.bindReturnField('quote.return', undefined, 'quote.score');
            expect(service.getReturnNode('quote.return').fields.map((item) => item.name)).toEqual([
                'score',
                'installment',
                'score2',
            ]);
            expect(service.bindReturnField('quote.return', 'score2', 'quote.applicant.age')).toBeUndefined();
            expect(service.getReturnNode('quote.return').fields[2]).toMatchObject({value: 'applicant.age'});
        });

        it('refuses to remove or rename a field that a caller reads', () => {
            const {service} = build();
            expect(service.removeReturnField('quote.return', 'installment')).toMatchObject({'@kind': 'error'});
            expect(service.renameReturnField('quote.return', 'installment', 'monthly')).toMatchObject({
                '@kind': 'error',
            });
            expect(service.removeReturnField('quote.return', 'score')).toBeUndefined();
            expect(service.getReturnNode('quote.return').fields.map((item) => item.name)).toEqual(['installment']);
        });

        it('moves a field and edits its expression', () => {
            const {service} = build();
            service.moveReturnField('quote.return', 'installment', 'up');
            expect(service.getReturnNode('quote.return').fields.map((item) => item.name)).toEqual([
                'installment',
                'score',
            ]);
            expect(service.setReturnFieldValue('quote.return', 'score', 'score * 2')).toBeUndefined();
            expect(service.setReturnFieldValue('quote.return', 'score', 'nothing')).toMatchObject({'@kind': 'error'});
            expect(service.getReturnNode('quote.return').fields[1].value).toBe('score * 2');
        });

        it('renames the node and clears its name; the return is always on the flow', () => {
            const {service, mutable} = build();
            service.setNodeName('quote.return', 'Offer');
            expect(service.getReturnNode('quote.return').label).toBe('Offer');
            expect(service.setNodeName('quote.return', '')).toBeUndefined();
            expect(service.getReturnNode('quote.return').label).toBeUndefined();
            expect(service.removeFromFlow('quote.return')).toMatchObject({'@kind': 'error'});
            expect(service.listNodes().map((node) => node.kind)).toContain('return');
            expect(body(mutable).return).toMatchObject({'@kind': 'context', score: {expression: 'score'}});
        });

        it('creates the return context with every value the service returns now, so callers keep linking', async () => {
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
            expect(service.createReturnNode()).toBe('f.return');
            expect(service.getReturnNode('f.return').fields.map((item) => [item.name, item.value])).toEqual([
                ['installment', 'installment'],
                ['total', 'total'],
            ]);
            expect(await mutable.execute('use')).toBe(240);
        });

        it('shows a `return` context without an annotation, and refuses to create a second one', () => {
            const {service} = build(`{ @Service func f(a: number): { b: a; return: { b: b } } }`, 'f');
            expect(service.listNodes().map((node) => node.kind)).toEqual(['parameter', 'expression', 'return']);
            expect(service.getReturnNode('f.return').fields.map((item) => item.name)).toEqual(['b']);
            expect(service.createReturnNode()).toMatchObject({'@kind': 'error', type: 'DuplicateName'});
        });

        it('shows a `return` expression with the fields it reads, and edits its text', async () => {
            const {service, mutable} = build(`{ @Service func f(a: number): { b: a * 2; return: b + 1 } }`, 'f');
            expect(service.listNodes()).toEqual([
                {field: 'f.a', kind: 'parameter'},
                {field: 'f.b', kind: 'expression'},
                {field: 'f.return', kind: 'return'},
            ]);
            expect(service.getReturnNode('f.return')).toMatchObject({
                fields: [],
                expression: 'b + 1',
                variables: ['b'],
                exists: true,
            });
            expect(service.setReturnExpression('f.return', 'b + a')).toBeUndefined();
            expect(service.getReturnNode('f.return').variables).toEqual(['b', 'a']);
            expect(service.setReturnExpression('f.return', 'nothing')).toMatchObject({'@kind': 'error'});
            expect(await mutable.execute('f', {a: 2})).toBe(6);
        });

        it('names a `return` expression with the annotation, and keeps the name when its text changes', () => {
            const {service} = build(`{ @Service func f(a: number): { return: a + 1 } }`, 'f');
            expect(service.setNodeName('f.return', 'Total')).toBeUndefined();
            expect(service.setReturnExpression('f.return', 'a + 2')).toBeUndefined();
            expect(service.getReturnNode('f.return')).toMatchObject({label: 'Total', expression: 'a + 2'});
            expect(service.removeFromFlow('f.return')).toMatchObject({'@kind': 'error'});
        });

        it('deletes the return, so the service returns its whole body again', () => {
            const {service} = build(`{ @Service func f(a: number): { b: a; return: b } }`, 'f');
            expect(service.deleteField('f.return')).toBeUndefined();
            expect(service.listNodes().map((node) => node.kind)).toEqual(['parameter', 'expression']);
            expect(service.createReturnNode()).toBe('f.return');
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

    it('shows a `return` expression as the return node, not as an expression node', () => {
        const {service} = build(`{ @Service func f(a: number): { b: a * 2; return: b + 1 } }`, 'f');
        expect(service.getExpressionNode('f.return')).toEqual({field: 'f.return', type: 'any', variables: []});
    });

    it('adds a new expression to the body of the service', async () => {
        const {service, mutable} = build(`{ @Service func f(a: number): { b: a } }`, 'f');
        expect(service.createExpressionNode()).toBe('f.expression');
        expect(service.createExpressionNode()).toBe('f.expression2');
        expect(service.listNodes().map((node) => node.field)).toEqual(['f.a', 'f.b', 'f.expression', 'f.expression2']);
        expect(service.getExpressionNode('f.expression').expression).toBe('0');
        expect(await mutable.execute('f', {a: 1})).toMatchObject({b: 1, expression: 0});
    });
});
