import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it} from 'vitest';
import {isFlowRoot, isRootPath, isTestSubject, resolveRootPath, rootPathSegments} from '../shell-path';

const model = MutableDecisionService.fromCode(
    `{
    type Customer: { name: <string> }
    func riskScore(income: number): { score: income / 100 }
    ruleset band(age: number): {
        hitPolicy: "first-match"
        rules: [{ when: { age: < 30 }, then: { level: "young" } }]
        default: { level: "none" }
    }
    applicant: {
        age: 21
        address: { city: "Vilnius" }
        func calculateAge(year: number): { result: 2026 - year }
    }
    loans: [1, 2]
    @Workbook
    book: {
        @FunctionNode
        score: riskScore(applicant.age)
    }
}`,
).toPortable();

describe('rootPathSegments', () => {
    it('lists a context segment per field and a function segment last', () => {
        expect(rootPathSegments(model, 'applicant.calculateAge')).toEqual([
            {name: 'applicant', path: 'applicant', kind: 'context'},
            {name: 'calculateAge', path: 'applicant.calculateAge', kind: 'function'},
        ]);
        expect(rootPathSegments(model, '*')).toEqual([]);
    });

    it('names the kind of every entity, a workbook and a plain field included', () => {
        expect(rootPathSegments(model, 'book.score')).toEqual([
            {name: 'book', path: 'book', kind: 'workbook'},
            {name: 'score', path: 'book.score', kind: 'field'},
        ]);
        expect(rootPathSegments(model, 'band').at(-1)?.kind).toBe('ruleset');
        expect(rootPathSegments(model, 'Customer').at(-1)?.kind).toBe('type');
        expect(rootPathSegments(model, 'loans').at(-1)?.kind).toBe('field');
    });
});

describe('isFlowRoot and isTestSubject', () => {
    it.each([
        ['*', true, true],
        ['applicant', true, false],
        ['book', true, false],
        ['riskScore', true, true],
        ['band', false, true],
        ['Customer', false, false],
        ['applicant.age', false, false],
    ])('%s: flow %s, test subject %s', (path, flow, subject) => {
        const segments = rootPathSegments(model, path);
        expect(isFlowRoot(segments)).toBe(flow);
        expect(isTestSubject(segments)).toBe(subject);
    });
});

describe('resolveRootPath', () => {
    it.each([
        ['*', '*'],
        ['applicant', 'applicant'],
        ['applicant.address', 'applicant.address'],
        ['applicant.calculateAge', 'applicant.calculateAge'],
        ['riskScore', 'riskScore'],
        // Every entity: a plain value, a ruleset, a type, a workbook and its nodes.
        ['loans', 'loans'],
        ['applicant.age', 'applicant.age'],
        ['band', 'band'],
        ['Customer', 'Customer'],
        ['book', 'book'],
        ['book.score', 'book.score'],
        // Nothing below a function or another entity that is not a context.
        ['applicant.calculateAge.result', 'applicant.calculateAge'],
        ['riskScore.score', 'riskScore'],
        ['Customer.name', 'Customer'],
        // No index.
        ['loans[0]', '*'],
        // A missing field.
        ['applicant.missing.city', 'applicant'],
        ['nothing', '*'],
    ])('%s opens %s', (path, expected) => {
        expect(resolveRootPath(model, path)).toBe(expected);
        expect(isRootPath(model, path)).toBe(path === expected);
    });
});
