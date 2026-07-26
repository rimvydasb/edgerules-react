import { MutableDecisionService } from '@edgerules/node/mutable';
import { describe, expect, it } from 'vitest';
import { listTestSubjects } from '../model/subjects';

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

describe('listTestSubjects', () => {
  it('discovers the model subject plus every fully typed callable of all four kinds', () => {
    const service = MutableDecisionService.fromCode(MODEL);
    const subjects = listTestSubjects(service);
    const ids = subjects.map((s) => `${s.kind}:${s.id}`);

    expect(ids).toContain('model:*');
    expect(ids).toContain('function:library.eligibility');
    expect(ids).toContain('ruleset:risk');
    expect(ids).toContain('optimise:plan');
    expect(ids).toContain('loop:amortize');
    expect(ids).toContain('function:outer');
  });

  it('discovers a nested callable by its dotted path', () => {
    const service = MutableDecisionService.fromCode(MODEL);
    const subjects = listTestSubjects(service);
    const nested = subjects.find((s) => s.id === 'library.eligibility');
    expect(nested).toEqual({ id: 'library.eligibility', kind: 'function', name: 'library.eligibility' });
  });

  it('excludes a callable declared inside another callable body', () => {
    const service = MutableDecisionService.fromCode(MODEL);
    const subjects = listTestSubjects(service);
    expect(subjects.some((s) => s.id === 'outer.inner')).toBe(false);
    expect(subjects.some((s) => s.id === 'inner')).toBe(false);
  });

  it('excludes a callable with an untyped parameter', () => {
    const service = MutableDecisionService.fromCode(MODEL);
    const subjects = listTestSubjects(service);
    expect(subjects.some((s) => s.id === 'untyped')).toBe(false);
  });

  it('labels the model subject with the model name, defaulting when none is declared', () => {
    const service = MutableDecisionService.fromCode('{ x: 1 }');
    const subjects = listTestSubjects(service);
    expect(subjects[0]).toEqual({ id: '*', kind: 'model', name: 'Model' });
  });
});
