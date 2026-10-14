import { describe, expect, it, vi } from 'vitest';
import { isPortableError } from '../../../lib/portable';
import { createFlowEditorService } from '../service/createFlowEditorService';
import { sampleService } from './sampleModel';

function build() {
    const { mutable, portable } = sampleService();
    return { mutable, portable, service: createFlowEditorService(mutable) };
}

describe('FlowEditorService reads', () => {
    it('lists user functions and rulesets with their signatures', () => {
        const { service } = build();
        const callees = service.listCallees();
        // The engine decides the order.
        expect(callees.map((callee) => [callee.path, callee.kind]).sort()).toEqual([
            ['applicantDecision', 'function'],
            ['creditScore', 'function'],
            ['monthly', 'function'],
            ['risk', 'ruleset'],
        ]);
        expect(callees.find((callee) => callee.path === 'risk')).toMatchObject({
            parameters: [
                { name: 'age', type: 'number' },
                { name: 'income', type: 'number' },
                { name: 'segment', type: 'string' },
            ],
            returnLabel: '{ level, limit }',
        });
        expect(callees.find((callee) => callee.path === 'monthly')?.returnLabel).toBe('number');
    });

    it('reads a committed ruleset invocation', () => {
        const { service } = build();
        const node = service.getFunctionNode('decision');
        expect(node.draft).toBe(false);
        expect(node.callee?.path).toBe('risk');
        expect(node.callers).toBe(1);
        expect(node.arguments.map((arg) => [arg.name, arg.binding])).toEqual([
            ['age', { kind: 'path', text: 'applicant.age' }],
            ['income', { kind: 'path', text: 'applicant.income' }],
            ['segment', { kind: 'path', text: 'applicant.segment' }],
        ]);
        expect(node.arguments.every((arg) => arg.used)).toBe(true);
        expect(node.results).toEqual([
            { name: 'level', type: 'string', renamable: true },
            { name: 'limit', type: 'number', renamable: true },
        ]);
    });

    it('marks an expression binding as a value and the unnamed return as not renamable', () => {
        const { service } = build();
        const node = service.getFunctionNode('payment');
        expect(node.arguments[0].binding).toEqual({ kind: 'value', text: 'application.amount * 1.1' });
        expect(node.results).toEqual([{ name: 'result', type: 'number', renamable: false }]);
    });

    it('reads a record argument type', () => {
        const { service } = build();
        expect(service.getFunctionNode('eligibility').arguments[0]).toMatchObject({
            name: 'person',
            type: 'Applicant',
        });
    });
});

describe('FlowEditorService drafts', () => {
    it('creates a draft node with no callee and writes nothing', () => {
        const { service, portable } = build();
        const before = Object.keys(portable());
        const field = service.createDraftNode();
        expect(field).toBe('node');
        expect(service.createDraftNode()).toBe('node2');
        expect(Object.keys(portable())).toEqual(before);
        expect(service.getFunctionNode(field)).toMatchObject({ draft: true, callee: undefined, arguments: [] });
    });

    it('does not write a draft', () => {
        const { service, portable, mutable } = build();
        const field = service.createDraftNode();
        expect(service.setCallee(field, 'risk')).toBeUndefined();
        expect(service.bindArgument(field, 'age', 'applicant.age')).toBeUndefined();
        expect(Object.keys(portable())).not.toContain(field);
        const node = service.getFunctionNode(field);
        expect(node.draft).toBe(true);
        expect(node.arguments.find((arg) => arg.name === 'age')?.binding?.text).toBe('applicant.age');
        expect(() => mutable.link()).not.toThrow();
    });

    it('writes the invocation with @node when the last required argument is bound', () => {
        const { service, portable } = build();
        const field = service.createDraftNode();
        service.setCallee(field, 'risk');
        service.bindArgument(field, 'age', 'applicant.age');
        service.bindArgument(field, 'income', 'applicant.income');
        expect(Object.keys(portable())).not.toContain(field);
        expect(service.bindArgument(field, 'segment', 'applicant.segment')).toBeUndefined();
        expect(portable()[field]).toMatchObject({
            '@kind': 'invocation',
            '@method': 'risk',
            '@node': 'FunctionNode',
            '@arguments': { age: 'applicant.age', income: 'applicant.income', segment: 'applicant.segment' },
        });
        expect(service.getFunctionNode(field).draft).toBe(false);
    });

    it('unbinding a required argument turns the node into a draft', () => {
        const { service } = build();
        service.unbindArgument('decision', 'segment');
        const node = service.getFunctionNode('decision');
        expect(node.draft).toBe(true);
        expect(node.arguments.find((arg) => arg.name === 'segment')?.binding).toBeUndefined();
        service.bindArgument('decision', 'segment', 'applicant.segment');
        expect(service.getFunctionNode('decision').draft).toBe(false);
    });
});

describe('FlowEditorService binding errors', () => {
    it('reverts a mistyped binding and sets error.parameter', () => {
        const { service, portable } = build();
        const before = portable().payment;
        const result = service.bindArgument('payment', 'amount', 'applicant.segment');
        expect(isPortableError(result)).toBe(true);
        // The engine keeps the `@node` annotation of a rejected write; the arguments are restored.
        expect(portable().payment).toMatchObject({ '@arguments': (before as { '@arguments': unknown })['@arguments'] });
        expect(service.getFunctionNode('payment').error).toMatchObject({ parameter: 'amount' });
        expect(service.getFunctionNode('payment').error?.message).toContain('type mismatch');
    });

    it('removes a new field whose last binding is mistyped and keeps the draft', () => {
        const { service, portable } = build();
        const field = service.createDraftNode();
        service.setCallee(field, 'monthly');
        expect(isPortableError(service.bindArgument(field, 'amount', 'applicant.segment'))).toBe(true);
        expect(Object.keys(portable())).not.toContain(field);
        const node = service.getFunctionNode(field);
        expect(node.draft).toBe(true);
        expect(node.arguments[0].binding).toBeUndefined();
    });

    it('clears the error after a successful binding', () => {
        const { service } = build();
        service.bindArgument('payment', 'amount', 'applicant.segment');
        expect(service.bindArgument('payment', 'amount', 'application.amount')).toBeUndefined();
        expect(service.getFunctionNode('payment').error).toBeUndefined();
    });

    it('returns an error when the node has no callee', () => {
        const { service } = build();
        const field = service.createDraftNode();
        expect(isPortableError(service.bindArgument(field, 'age', 'applicant.age'))).toBe(true);
    });
});

describe('FlowEditorService.setCallee', () => {
    it('keeps bindings with the same name and type', () => {
        const { service } = build();
        const field = service.createDraftNode();
        service.setCallee(field, 'risk');
        service.bindArgument(field, 'age', 'applicant.age');
        service.bindArgument(field, 'income', 'applicant.income');
        service.bindArgument(field, 'segment', 'applicant.segment');

        expect(service.setCallee(field, 'creditScore')).toBeUndefined();
        const node = service.getFunctionNode(field);
        expect(node.callee?.path).toBe('creditScore');
        expect(node.draft).toBe(false);
        expect(node.arguments.map((arg) => [arg.name, arg.binding?.text])).toEqual([
            ['age', 'applicant.age'],
            ['income', 'applicant.income'],
        ]);
    });

    it('drops a binding whose type differs and becomes a draft', () => {
        const { service } = build();
        // monthly(amount: number) -> applicantDecision(person: Applicant): no shared name.
        service.setCallee('payment', 'applicantDecision');
        const node = service.getFunctionNode('payment');
        expect(node.draft).toBe(true);
        expect(node.arguments[0].binding).toBeUndefined();
    });

    it('rejects a name that is not a user callable', () => {
        const { service } = build();
        const field = service.createDraftNode();
        expect(isPortableError(service.setCallee(field, 'round'))).toBe(true);
    });
});

describe('FlowEditorService.subscribe', () => {
    it('notifies on changes until unsubscribed', () => {
        const { service } = build();
        const listener = vi.fn();
        const unsubscribe = service.subscribe(listener);
        service.bindArgument('payment', 'amount', 'application.amount');
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        service.bindArgument('payment', 'amount', 'application.amount');
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
