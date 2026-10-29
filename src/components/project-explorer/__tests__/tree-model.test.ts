import {describe, expect, it} from 'vitest';
import type {PortableContext} from '@edgerules/portable';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {buildSections, isIdentifier, methodKind} from '../tree-model';
import {uniqueName} from '../create-templates';
import {MODEL_DSL} from '../testing/model.dsl';

function sections(code: string, testSubjects: string[] = []) {
    const service = MutableDecisionService.fromCode(code);
    return buildSections(
        service.get('*') as PortableContext,
        service.get('*', 'TYPE_DEFINITIONS') as PortableContext,
        testSubjects,
    );
}

describe('buildSections', () => {
    it('splits the model into Types, Methods, Service Methods, Variables, Workbooks and Tests, each by name', () => {
        const result = sections(MODEL_DSL, ['riskScore', '*']);

        expect(result.types.map((entry) => entry.path)).toEqual(['PeopleList', 'Person']);
        expect(result.methods.map((entry) => [entry.kind, entry.label])).toEqual([
            ['function', 'nested.deep()'],
            ['ruleset', 'risk(...)'],
            ['function', 'riskScore(...)'],
        ]);
        expect(result.services.map((entry) => [entry.kind, entry.label])).toEqual([
            ['service', 'processApplication(...)'],
        ]);
        expect(result.variables.map((entry) => [entry.kind, entry.path])).toEqual([
            ['variable', 'globalConst'],
            ['variable', 'list'],
            ['context', 'nested'],
        ]);
        expect(result.tests.map((entry) => [entry.path, entry.label])).toEqual([
            ['*', 'Model'],
            ['riskScore', 'riskScore(...)'],
        ]);
    });

    it('lists the Flow Component nodes of a workbook as its children', () => {
        const [workbook] = sections(MODEL_DSL).workbooks;

        expect(workbook).toMatchObject({kind: 'workbook', path: 'loanBook'});
        // `helper` has no node annotation: it is not a node.
        expect(workbook!.children!.map((entry) => [entry.kind, entry.path])).toEqual([
            ['input-node', 'loanBook.applicant'],
            ['function-node', 'loanBook.decision'],
            ['output-node', 'loanBook.result'],
        ]);
    });

    it('lists a service inside a context as a service method by its qualified path', () => {
        const result = sections('{ nested: { @Service\n func deep(): 1 } }');
        expect(result.services.map((entry) => entry.label)).toEqual(['nested.deep()']);
        expect(result.methods).toEqual([]);
    });

    it('does not list a callable of a workbook as a method', () => {
        const result = sections('{ @Workbook book: { func local(): 1 } }');
        expect(result.methods).toEqual([]);
        expect(result.workbooks.map((entry) => entry.path)).toEqual(['book']);
    });

    it('treats the model root as the workbook when no context has @Workbook but the root has nodes', () => {
        const result = sections(
            '{ @InputNode applicant: { age: 21 }\n @FunctionNode risk: applicant.age * 2\n limit: 10 }',
        );

        expect(result.workbooks).toEqual([
            {
                kind: 'workbook',
                path: '*',
                label: 'Model',
                children: [
                    {kind: 'input-node', path: 'applicant', label: 'applicant'},
                    {kind: 'function-node', path: 'risk', label: 'risk'},
                ],
            },
        ]);
        expect(result.variables.map((entry) => entry.path)).toEqual(['limit']);
    });

    it('does not treat the model root as a workbook when a context has @Workbook', () => {
        const result = sections('{ @InputNode applicant: { age: 21 }\n @Workbook book: { @InputNode x: { a: 1 } } }');
        expect(result.workbooks.map((entry) => entry.path)).toEqual(['book']);
        expect(result.variables.map((entry) => entry.path)).toEqual(['applicant']);
    });
});

describe('methodKind', () => {
    it('tells functions, services and rulesets apart, and is undefined for anything else', () => {
        expect(methodKind({'@kind': 'function-schema'})).toBe('function');
        expect(methodKind({'@kind': 'function', '@node': 'Service'})).toBe('service');
        expect(methodKind({'@kind': 'ruleset-schema'})).toBe('ruleset');
        expect(methodKind({'@kind': 'context'})).toBeUndefined();
        expect(methodKind(5)).toBeUndefined();
    });
});

describe('isIdentifier and uniqueName', () => {
    it('accepts EdgeRules identifiers only', () => {
        expect(isIdentifier('newFunction_2')).toBe(true);
        expect(isIdentifier('2fast')).toBe(false);
        expect(isIdentifier('a.b')).toBe(false);
        expect(isIdentifier('')).toBe(false);
    });

    it('adds the first free number to a taken name', () => {
        expect(uniqueName('newType', new Set())).toBe('newType');
        expect(uniqueName('newType', new Set(['newType', 'newType2']))).toBe('newType3');
    });
});
