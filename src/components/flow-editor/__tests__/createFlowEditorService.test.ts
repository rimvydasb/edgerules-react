import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it, vi} from 'vitest';
import {isPortableError} from '../../../lib/portable';
import {createFlowEditorService} from '../service/createFlowEditorService';
import {SAMPLE_MODEL, sampleService} from '../testing/sampleModel';

function build() {
    const {mutable, portable} = sampleService();
    return {mutable, portable, service: createFlowEditorService(mutable)};
}

describe('FlowEditorService reads', () => {
    it('lists user functions and rulesets with their signatures', () => {
        const {service} = build();
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
                {name: 'age', type: 'number'},
                {name: 'income', type: 'number'},
                {name: 'segment', type: 'string'},
            ],
            returnLabel: '{ level, limit }',
        });
        expect(callees.find((callee) => callee.path === 'monthly')?.returnLabel).toBe('number');
    });

    it('reads a committed ruleset invocation', () => {
        const {service} = build();
        const node = service.getFunctionNode('decision');
        expect(node.draft).toBe(false);
        expect(node.callee?.path).toBe('risk');
        expect(node.callers).toBe(1);
        expect(node.arguments.map((arg) => [arg.name, arg.binding])).toEqual([
            ['age', {kind: 'path', text: 'applicant.age'}],
            ['income', {kind: 'path', text: 'applicant.income'}],
            ['segment', {kind: 'path', text: 'applicant.segment'}],
        ]);
        expect(node.arguments.every((arg) => arg.used)).toBe(true);
        expect(node.results).toEqual([
            {name: 'level', type: 'string', renamable: true},
            {name: 'limit', type: 'number', renamable: true},
        ]);
    });

    it('marks an expression binding as a value and the unnamed return as not renamable', () => {
        const {service} = build();
        const node = service.getFunctionNode('payment');
        expect(node.arguments[0].binding).toEqual({kind: 'value', text: 'application.amount * 1.1'});
        expect(node.results).toEqual([{name: 'result', type: 'number', renamable: false}]);
    });

    it('reads a record argument type', () => {
        const {service} = build();
        expect(service.getFunctionNode('eligibility').arguments[0]).toMatchObject({
            name: 'person',
            type: 'Applicant',
        });
    });
});

describe('FlowEditorService drafts', () => {
    it('creates a draft node with no callee and writes nothing', () => {
        const {service, portable} = build();
        const before = Object.keys(portable());
        const field = service.createDraftNode();
        expect(field).toBe('node');
        expect(service.createDraftNode()).toBe('node2');
        expect(Object.keys(portable())).toEqual(before);
        expect(service.getFunctionNode(field)).toMatchObject({draft: true, callee: undefined, arguments: []});
    });

    it('does not write a draft', () => {
        const {service, portable, mutable} = build();
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
        const {service, portable} = build();
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
            '@arguments': {age: 'applicant.age', income: 'applicant.income', segment: 'applicant.segment'},
        });
        expect(service.getFunctionNode(field).draft).toBe(false);
    });

    it('unbinding a required argument turns the node into a draft', () => {
        const {service} = build();
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
        const {service, portable} = build();
        const before = portable().payment;
        const result = service.bindArgument('payment', 'amount', 'applicant.segment');
        expect(isPortableError(result)).toBe(true);
        // The engine keeps the `@node` annotation of a rejected write; the arguments are restored.
        expect(portable().payment).toMatchObject({'@arguments': (before as {'@arguments': unknown})['@arguments']});
        expect(service.getFunctionNode('payment').error).toMatchObject({parameter: 'amount'});
        expect(service.getFunctionNode('payment').error?.message).toContain('type mismatch');
    });

    it('removes a new field whose last binding is mistyped and keeps the draft', () => {
        const {service, portable} = build();
        const field = service.createDraftNode();
        service.setCallee(field, 'monthly');
        expect(isPortableError(service.bindArgument(field, 'amount', 'applicant.segment'))).toBe(true);
        expect(Object.keys(portable())).not.toContain(field);
        const node = service.getFunctionNode(field);
        expect(node.draft).toBe(true);
        expect(node.arguments[0].binding).toBeUndefined();
    });

    it('clears the error after a successful binding', () => {
        const {service} = build();
        service.bindArgument('payment', 'amount', 'applicant.segment');
        expect(service.bindArgument('payment', 'amount', 'application.amount')).toBeUndefined();
        expect(service.getFunctionNode('payment').error).toBeUndefined();
    });

    it('returns an error when the node has no callee', () => {
        const {service} = build();
        const field = service.createDraftNode();
        expect(isPortableError(service.bindArgument(field, 'age', 'applicant.age'))).toBe(true);
    });
});

describe('FlowEditorService.setCallee', () => {
    it('keeps bindings with the same name and type', () => {
        const {service} = build();
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
        const {service} = build();
        // monthly(amount: number) -> applicantDecision(person: Applicant): no shared name.
        service.setCallee('payment', 'applicantDecision');
        const node = service.getFunctionNode('payment');
        expect(node.draft).toBe(true);
        expect(node.arguments[0].binding).toBeUndefined();
    });

    it('rejects a name that is not a user callable', () => {
        const {service} = build();
        const field = service.createDraftNode();
        expect(isPortableError(service.setCallee(field, 'round'))).toBe(true);
    });
});

describe('FlowEditorService.subscribe', () => {
    it('notifies on changes until unsubscribed', () => {
        const {service} = build();
        const listener = vi.fn();
        const unsubscribe = service.subscribe(listener);
        service.bindArgument('payment', 'amount', 'application.amount');
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        service.bindArgument('payment', 'amount', 'application.amount');
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

const CONSUMERS = `
  levelOf: decision.level
  otherDecision: risk(age: applicant.age, income: applicant.income, segment: applicant.segment)
  otherLevel: otherDecision.level
`;

function buildWithConsumers(extra = CONSUMERS) {
    const mutable = MutableDecisionService.fromCode(SAMPLE_MODEL.replace(/\}$/, `${extra}}`));
    const portable = () => mutable.toPortable() as unknown as Record<string, Record<string, unknown>>;
    return {mutable, portable, service: createFlowEditorService(mutable)};
}

const expressionText = (node: unknown) => (node as {expression?: string}).expression ?? node;

describe('FlowEditorService.renameResult', () => {
    it('rewrites the wires of every caller of a ruleset', () => {
        const {service, portable, mutable} = buildWithConsumers();
        expect(service.renameResult('decision', 'level', 'tier')).toBeUndefined();
        expect(expressionText(portable().levelOf)).toBe('decision.tier');
        expect(expressionText(portable().otherLevel)).toBe('otherDecision.tier');
        expect(
            service
                .getFunctionNode('decision')
                .results.map((result) => result.name)
                .sort(),
        ).toEqual(['limit', 'tier']);
        expect(() => mutable.link()).not.toThrow();
    });

    it('rewrites the wires of every caller of a func', () => {
        const {service, portable, mutable} = buildWithConsumers(`
  allowed: eligibility.eligible
  second: applicantDecision(person: applicant)
  secondReason: second.reason
`);
        expect(service.renameResult('eligibility', 'eligible', 'permitted')).toBeUndefined();
        expect(expressionText(portable().allowed)).toBe('eligibility.permitted');
        expect(service.getFunctionNode('second').results.map((result) => result.name)).toEqual(['permitted', 'reason']);
        expect(() => mutable.link()).not.toThrow();
    });

    it('reverts on a failed link', () => {
        // `alias.level` is not a reference the service can find, so the model no longer links.
        const {service, portable} = buildWithConsumers(`
  alias: decision
  aliasLevel: alias.level
`);
        const before = JSON.stringify(portable());
        const result = service.renameResult('decision', 'level', 'tier');
        expect(isPortableError(result)).toBe(true);
        expect(JSON.stringify(portable())).toBe(before);
        expect(service.getFunctionNode('decision').results.map((r) => r.name)).toEqual(['level', 'limit']);
    });

    it('refuses the unnamed return, a duplicate name and an invalid name', () => {
        const {service} = build();
        expect(isPortableError(service.renameResult('payment', 'result', 'total'))).toBe(true);
        expect(isPortableError(service.renameResult('decision', 'level', 'limit'))).toBe(true);
        expect(isPortableError(service.renameResult('decision', 'level', '1st'))).toBe(true);
    });
});

describe('FlowEditorService.removeFromFlow and deleteField', () => {
    it('removeFromFlow keeps the field', () => {
        const {service, portable, mutable} = build();
        expect(service.removeFromFlow('decision')).toBeUndefined();
        // The invocation stays in the model without the node annotation.
        expect(portable().decision).toMatchObject({'@kind': 'invocation', '@method': 'risk'});
        expect((portable().decision as Record<string, unknown>)['@node']).toBeUndefined();
        expect(() => mutable.link()).not.toThrow();
    });

    it('removeFromFlow drops a draft', () => {
        const {service} = build();
        const field = service.createDraftNode();
        expect(service.removeFromFlow(field)).toBeUndefined();
        expect(service.getFunctionNode(field).callee).toBeUndefined();
    });

    it('deleteField removes the field', () => {
        const {service, portable} = build();
        expect(service.deleteField('score')).toBeUndefined();
        expect(Object.keys(portable())).not.toContain('score');
    });

    it('deleteField reverts when another field still reads the node', () => {
        const {service, portable} = buildWithConsumers();
        const result = service.deleteField('decision');
        expect(isPortableError(result)).toBe(true);
        expect(portable().decision).toMatchObject({'@method': 'risk'});
    });
});

describe('FlowEditorService parameter edits', () => {
    it('adds an argument to a func and migrates every call site', () => {
        const {service, portable, mutable} = buildWithConsumers(`
  payment2: monthly(amount: 5)
`);
        expect(service.addArgument('payment')).toBeUndefined();
        const names = service.getFunctionNode('payment').arguments.map((arg) => arg.name);
        expect(names).toEqual(['amount', 'arg']);
        for (const field of ['payment', 'payment2']) {
            expect(Object.keys(portable()[field]['@arguments'] as object)).toEqual(['amount', 'arg']);
        }
        expect(() => mutable.link()).not.toThrow();
    });

    it('adds a string argument to a ruleset', () => {
        const {service} = build();
        expect(service.addArgument('decision')).toBeUndefined();
        const added = service.getFunctionNode('decision').arguments.at(-1);
        expect(added).toMatchObject({name: 'arg', type: 'string'});
    });

    it('inserts after the given argument', () => {
        const {service} = build();
        service.addArgument('decision', 'age');
        expect(service.getFunctionNode('decision').arguments.map((arg) => arg.name)).toEqual([
            'age',
            'arg',
            'income',
            'segment',
        ]);
    });

    it('moves an argument and keeps the bindings', () => {
        const {service} = build();
        expect(service.moveArgument('decision', 'segment', 'up')).toBeUndefined();
        const node = service.getFunctionNode('decision');
        expect(node.arguments.map((arg) => arg.name)).toEqual(['age', 'segment', 'income']);
        expect(node.arguments[1].binding?.text).toBe('applicant.segment');
        expect(service.moveArgument('score', 'age', 'down')).toBeUndefined();
        expect(service.getFunctionNode('score').arguments.map((arg) => arg.name)).toEqual(['income', 'age']);
    });

    it('does nothing when moving past the first or last row', () => {
        const {service} = build();
        expect(service.moveArgument('decision', 'age', 'up')).toBeUndefined();
        expect(service.getFunctionNode('decision').arguments[0].name).toBe('age');
    });

    it('refuses to remove an argument the body uses', () => {
        const {service} = build();
        expect(isPortableError(service.removeArgument('score', 'age'))).toBe(true);
        expect(service.getFunctionNode('score').arguments.map((arg) => arg.name)).toEqual(['age', 'income']);
    });

    it('removes an unused argument and migrates every call site', () => {
        const {service, portable} = buildWithConsumers(`
  extra2: monthly(amount: 5)
`);
        service.addArgument('payment');
        expect(service.removeArgument('payment', 'arg')).toBeUndefined();
        for (const field of ['payment', 'extra2']) {
            expect(Object.keys(portable()[field]['@arguments'] as object)).toEqual(['amount']);
        }
    });
});

describe('FlowEditorService node edits', () => {
    it('sets and clears the node name', () => {
        const {service, portable} = build();
        expect(service.setNodeName('decision', 'Risk decision')).toBeUndefined();
        expect(service.getFunctionNode('decision').label).toBe('Risk decision');
        expect((portable().decision as Record<string, unknown>)['@node-name']).toBe('Risk decision');
        service.setNodeName('decision', '');
        expect(service.getFunctionNode('decision').label).toBeUndefined();
    });

    it('renames a field and the wires that read it', () => {
        const {service, portable, mutable} = buildWithConsumers();
        expect(service.renameField('decision', 'riskDecision')).toBeUndefined();
        expect(portable().riskDecision).toMatchObject({'@method': 'risk'});
        expect(expressionText(portable().levelOf)).toBe('riskDecision.level');
        expect(() => mutable.link()).not.toThrow();
    });

    it('refuses a duplicate or invalid field name', () => {
        const {service} = build();
        expect(isPortableError(service.renameField('decision', 'score'))).toBe(true);
        expect(isPortableError(service.renameField('decision', 'a b'))).toBe(true);
    });

    it('renames a draft node', () => {
        const {service} = build();
        const field = service.createDraftNode();
        service.setCallee(field, 'risk');
        expect(service.renameField(field, 'fresh')).toBeUndefined();
        expect(service.getFunctionNode('fresh').callee?.path).toBe('risk');
    });

    it('duplicates a node under a unique name', () => {
        const {service, portable} = build();
        const copy = service.duplicate('decision');
        expect(copy).toBe('decision2');
        expect(portable().decision2).toMatchObject({'@method': 'risk', '@node': 'FunctionNode'});
        expect(service.getFunctionNode('decision2').arguments[0].binding?.text).toBe('applicant.age');
    });
});

describe('FlowEditorService.renameArgument', () => {
    it('renames a func argument and migrates every call site', () => {
        const {service, portable} = buildWithConsumers(`
  payment2: monthly(amount: 5)
`);
        service.addArgument('payment');
        expect(service.renameArgument('payment', 'arg', 'months')).toBeUndefined();
        for (const field of ['payment', 'payment2']) {
            expect(Object.keys(portable()[field]['@arguments'] as object)).toEqual(['amount', 'months']);
        }
    });

    it('refuses a duplicate or invalid name', () => {
        const {service} = build();
        expect(isPortableError(service.renameArgument('decision', 'age', 'income'))).toBe(true);
        expect(isPortableError(service.renameArgument('decision', 'age', '9x'))).toBe(true);
    });
});

describe('InputNode service', () => {
    it('lists record fields that are not yet an input node', () => {
        const {service} = build();
        expect(service.listInputCandidates().sort()).toEqual(['applicant', 'application']);
        service.addInputNode('applicant');
        expect(service.listInputCandidates()).toEqual(['application']);
    });

    it('addInputNode annotates the record and keeps its values', () => {
        const {service, portable} = build();
        expect(service.addInputNode('applicant')).toBeUndefined();
        expect(portable().applicant).toMatchObject({'@kind': 'context', '@node': 'InputNode', age: 23});
    });

    it('refuses a field that is not a record', () => {
        const {service} = build();
        expect(isPortableError(service.addInputNode('decision') as never)).toBe(true);
        expect(isPortableError(service.addInputNode('missing') as never)).toBe(true);
    });

    it('reads the typed fields of the record', () => {
        const {service} = build();
        service.addInputNode('applicant');
        expect(service.getInputNode('applicant').fields).toEqual([
            {name: 'age', type: 'number', value: '23', used: true},
            {name: 'income', type: 'number', value: '25000', used: true},
            {name: 'segment', type: 'string', value: "'retail'", used: true},
        ]);
    });

    describe('setInputFieldValue', () => {
        it('writes the expression and recalculates what reads the field', async () => {
            const {service, portable} = build();
            service.addInputNode('applicant');
            expect(await service.readOutput('decision.level')).toEqual({value: 'high', type: 'string'});
            const listener = vi.fn();
            service.subscribe(listener);

            expect(service.setInputFieldValue('applicant', 'age', '30')).toBeUndefined();

            expect(listener).toHaveBeenCalled();
            expect(portable().applicant).toMatchObject({'@node': 'InputNode', age: 30});
            expect(service.getInputNode('applicant').fields[0]).toMatchObject({name: 'age', value: '30'});
            expect(await service.readOutput('decision.level')).toEqual({value: 'medium', type: 'string'});
        });

        it('accepts an expression that reads another field', async () => {
            const {service} = build();
            service.addInputNode('applicant');
            expect(service.setInputFieldValue('applicant', 'age', '20 + 10')).toBeUndefined();
            expect(service.getInputNode('applicant').fields[0].value).toBe('20 + 10');
            expect(await service.readOutput('decision.level')).toEqual({value: 'medium', type: 'string'});
        });

        it('refuses invalid text and keeps the previous value', () => {
            const {service, portable} = build();
            service.addInputNode('applicant');
            expect(isPortableError(service.setInputFieldValue('applicant', 'age', '30 +') as never)).toBe(true);
            expect(isPortableError(service.setInputFieldValue('applicant', 'age', '  ') as never)).toBe(true);
            expect(portable().applicant).toMatchObject({age: 23});
        });

        it('reverts a value whose type breaks a reader', () => {
            const {service, portable} = build();
            service.addInputNode('applicant');
            expect(isPortableError(service.setInputFieldValue('applicant', 'age', "'old'") as never)).toBe(true);
            expect(portable().applicant).toMatchObject({age: 23});
        });

        it('refuses a missing field or node', () => {
            const {service} = build();
            service.addInputNode('applicant');
            expect(isPortableError(service.setInputFieldValue('applicant', 'missing', '1') as never)).toBe(true);
            expect(isPortableError(service.setInputFieldValue('application', 'amount', '1') as never)).toBe(true);
        });
    });

    it('inputValueContext wraps the value in the model text around it', () => {
        const {service} = build();
        service.addInputNode('applicant');
        const {prefix, suffix} = service.inputValueContext('applicant', 'age');
        expect(prefix).toMatch(/applicant: \{ age: $/);
        expect(suffix).toMatch(/^; income: 25000/);
    });

    it('returns no fields for a record that is not an input node', () => {
        const {service} = build();
        expect(service.getInputNode('applicant').fields).toEqual([]);
    });

    it('sets and clears the node name', () => {
        const {service, portable} = build();
        service.addInputNode('applicant');
        expect(service.setNodeName('applicant', 'Applicant')).toBeUndefined();
        expect(service.getInputNode('applicant').label).toBe('Applicant');
        service.setNodeName('applicant', '');
        expect(portable().applicant).not.toHaveProperty('@node-name');
        expect(portable().applicant).toHaveProperty('@node', 'InputNode');
    });

    it('renames a field and migrates only the references to it', () => {
        const {service, portable} = build();
        service.addInputNode('applicant');
        expect(isPortableError(service.renameInputField('applicant', 'age', 'income') as never)).toBe(true);
        expect(isPortableError(service.renameInputField('applicant', 'age', '1x') as never)).toBe(true);
        expect(service.renameInputField('applicant', 'age', 'years')).toBeUndefined();
        expect(service.getInputNode('applicant').fields.map((item) => item.name)).toEqual([
            'years',
            'income',
            'segment',
        ]);
        // The wire follows the field; the argument keeps its own name.
        expect(portable().decision).toMatchObject({
            '@arguments': {age: 'applicant.years', income: 'applicant.income', segment: 'applicant.segment'},
        });
        expect(portable().score).toMatchObject({'@arguments': {age: 'applicant.years'}});
    });

    it('a field rename leaves same-named callee parameters and rules alone', () => {
        const {service, portable} = build();
        service.addInputNode('applicant');
        const before = JSON.stringify(portable().risk);
        service.renameInputField('applicant', 'age', 'years');
        expect(JSON.stringify(portable().risk)).toBe(before);
        expect(service.getFunctionNode('decision').arguments.map((argument) => argument.name)).toEqual([
            'age',
            'income',
            'segment',
        ]);
        expect(service.getFunctionNode('decision').draft).toBe(false);
    });

    it('a field rename keeps the model annotations and the other entries', () => {
        const {service, portable} = build();
        service.addInputNode('applicant');
        service.setNodeName('applicant', 'Applicant');
        service.renameInputField('applicant', 'segment', 'channel');
        expect(portable().applicant).toMatchObject({
            '@node': 'InputNode',
            '@node-name': 'Applicant',
            channel: "'retail'",
        });
        expect(Object.keys(portable().applicant)).toEqual(expect.arrayContaining(['age', 'income', 'channel']));
        expect(portable().application).toMatchObject({amount: 32000});
    });

    it('a field rename is reverted when the model no longer links', () => {
        const mutable = MutableDecisionService.fromCode('{ rec: { a: 1; b: a + 1 } }');
        const service = createFlowEditorService(mutable);
        service.addInputNode('rec');
        const before = JSON.stringify(mutable.toPortable());
        // `b` reads its sibling `a` by a bare name, which a path-based rewrite does not reach.
        expect(isPortableError(service.renameInputField('rec', 'a', 'z') as never)).toBe(true);
        expect(JSON.stringify(mutable.toPortable())).toBe(before);
    });

    it('marks a field that an expression reads as used', () => {
        const {service} = build();
        service.addInputNode('applicant');
        expect(service.getInputNode('applicant').fields.map((item) => item.used)).toEqual([true, true, true]);
        service.addInputField('applicant');
        expect(service.getInputNode('applicant').fields.at(-1)?.used).toBe(false);
    });

    it('adds, moves and removes fields and keeps the annotations', () => {
        const {service, portable} = build();
        service.addInputNode('applicant');
        service.setNodeName('applicant', 'Applicant');
        const names = () => service.getInputNode('applicant').fields.map((item) => item.name);
        expect(service.addInputField('applicant', 'age')).toBeUndefined();
        expect(names()).toEqual(['age', 'field', 'income', 'segment']);
        expect(service.moveInputField('applicant', 'field', 'down')).toBeUndefined();
        expect(names()).toEqual(['age', 'income', 'field', 'segment']);
        expect(service.removeInputField('applicant', 'field')).toBeUndefined();
        expect(names()).toEqual(['age', 'income', 'segment']);
        expect(portable().applicant).toMatchObject({'@node': 'InputNode', '@node-name': 'Applicant'});
    });

    it('removeInputField reverts when an expression reads the field', () => {
        const {service} = build();
        service.addInputNode('applicant');
        expect(isPortableError(service.removeInputField('applicant', 'age') as never)).toBe(true);
        expect(service.getInputNode('applicant').fields.map((item) => item.name)).toContain('age');
    });

    it('duplicates the record with its annotation', () => {
        const {service, portable} = build();
        service.addInputNode('applicant');
        const copy = service.duplicate('applicant');
        expect(copy).toBe('applicant2');
        expect(portable().applicant2).toMatchObject({'@node': 'InputNode', age: 23});
    });

    it('removeFromFlow keeps the record and drops the annotation', () => {
        const {service, portable} = build();
        service.addInputNode('applicant');
        service.setNodeName('applicant', 'Applicant');
        expect(service.removeFromFlow('applicant')).toBeUndefined();
        expect(portable().applicant).toMatchObject({'@kind': 'context', age: 23});
        expect(portable().applicant).not.toHaveProperty('@node');
        expect(portable().applicant).not.toHaveProperty('@node-name');
    });

    it('deleteField reverts when another field still reads the record', () => {
        const {service, portable} = build();
        service.addInputNode('applicant');
        expect(isPortableError(service.deleteField('applicant') as never)).toBe(true);
        expect(portable().applicant).toMatchObject({'@node': 'InputNode'});
    });

    it('deleteField removes a record that nothing reads', () => {
        const mutable = MutableDecisionService.fromCode('{ spare: { a: 1 }\n  other: 2 }');
        const service = createFlowEditorService(mutable);
        service.addInputNode('spare');
        expect(service.deleteField('spare')).toBeUndefined();
        expect(mutable.toPortable()).not.toHaveProperty('spare');
    });
});

describe('FlowEditorService flow nodes', () => {
    it('lists annotated fields in model order, then the drafts', () => {
        const {service} = build();
        expect(service.listNodes()).toEqual([]);
        service.addInputNode('applicant');
        service.setCallee('decision', 'risk'); // writes @node: FunctionNode
        const draft = service.createDraftNode();
        expect(service.listNodes()).toEqual([
            {field: 'applicant', kind: 'input'},
            {field: 'decision', kind: 'function'},
            {field: draft, kind: 'function'},
        ]);
    });

    it('drops a node that is removed from the flow', () => {
        const {service} = build();
        service.addInputNode('applicant');
        service.removeFromFlow('applicant');
        expect(service.listNodes()).toEqual([]);
    });

    it('creates a new input record with one number field and notifies', () => {
        const {service, portable} = build();
        const listener = vi.fn();
        service.subscribe(listener);
        const field = service.createInputNode();
        expect(field).toBe('input');
        expect(portable().input).toMatchObject({'@kind': 'context', '@node': 'InputNode', value: 0});
        expect(service.getInputNode('input').fields).toEqual([
            {name: 'value', type: 'number', value: '0', used: false},
        ]);
        expect(service.createInputNode()).toBe('input2');
        expect(listener).toHaveBeenCalledTimes(2);
    });
});
