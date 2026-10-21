import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it} from 'vitest';
import {listCallables} from '../callables';

const MODEL = `{
    library: {
        func eligibility(age: number): { ok: age >= 18 }
    }
    ruleset risk(age: number): {
        hitPolicy: "first-match"
        rules: [ { when: { age: 18..25 }, then: { level: "high" } } ]
        default: { level: "none" }
    }
    optimise plan(cap: number): {
        variables: { x: <number, min: 0> }
        maximise: x
        constraints: { capC: x <= cap }
    }
    loop amortize(principal: number): {
        state: { balance: principal }
        while: state.balance > 0
        maxIterations: 5
        do: { balance: state.balance - 1 }
        return: { balance: state.balance }
    }
    func outer(a: number): {
        func inner(b: number): b + 1
        v: inner(a)
    }
    func untyped(x): x + 1
    result: plan(cap: 10)
}`;

describe('listCallables', () => {
    it('lists every fully typed callable of all four kinds by dotted path', () => {
        const callables = listCallables(MutableDecisionService.fromCode(MODEL));
        expect(callables).toEqual(
            expect.arrayContaining([
                {path: 'library.eligibility', kind: 'function'},
                {path: 'risk', kind: 'ruleset'},
                {path: 'amortize', kind: 'loop'},
                {path: 'outer', kind: 'function'},
                {path: 'plan', kind: 'optimise'},
            ]),
        );
        expect(callables).toHaveLength(5);
    });

    it('excludes callables with untyped parameters and callables nested in a body', () => {
        const paths = listCallables(MutableDecisionService.fromCode(MODEL)).map((c) => c.path);
        expect(paths).not.toContain('untyped');
        expect(paths).not.toContain('outer.inner');
    });

    it('returns an empty list for a model without callables', () => {
        expect(listCallables(MutableDecisionService.fromCode('{ a: 1 }'))).toEqual([]);
    });
});
