import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it} from 'vitest';
import {isRootPath, resolveRootPath, rootPathSegments} from '../shell-path';

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
});

describe('resolveRootPath', () => {
    it.each([
        ['*', '*'],
        ['applicant', 'applicant'],
        ['applicant.address', 'applicant.address'],
        ['applicant.calculateAge', 'applicant.calculateAge'],
        ['riskScore', 'riskScore'],
        // Nothing below a function.
        ['applicant.calculateAge.result', 'applicant.calculateAge'],
        ['riskScore.score', 'riskScore'],
        // No index, plain value, ruleset or type.
        ['loans[0]', '*'],
        ['loans', '*'],
        ['applicant.age', 'applicant'],
        ['band', '*'],
        ['Customer', '*'],
        // A missing field.
        ['applicant.missing.city', 'applicant'],
        ['nothing', '*'],
    ])('%s opens %s', (path, expected) => {
        expect(resolveRootPath(model, path)).toBe(expected);
        expect(isRootPath(model, path)).toBe(path === expected);
    });
});
