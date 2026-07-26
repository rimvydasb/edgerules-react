import { MutableDecisionService } from '@edgerules/node/mutable';
import { describe, expect, it } from 'vitest';
import { detectRenames, deriveRows, flattenResult } from '../model/rows';
import type { TestSubject } from '../tests-manager-types';
import type { TestRow } from '../../test-cases-service';

const MODEL_SUBJECT: TestSubject = { id: '*', kind: 'model', name: 'Workbook' };

const WORKBOOK_MODEL = `{
    type Customer: {
        name: <string>
        tier: <string, enum: ["GOLD", "SILVER"]>
    }
    maxLimit: 10000,
    name: <string, required: true>,
    age: <number, required: true>,
    customer: <Customer>
    credit: {
        balance: <number, required: true>,
        limit: <number, required: true>
    },
    creditDecision: {
        approved: if credit.balance >= 0 and age > 17 then true else false,
        limit: if creditDecision.approved then maxLimit else 0
    }
}`;

function pathsIn(rows: ReturnType<typeof deriveRows>, section: string): string[] {
  return rows.filter((r) => r.section === section).map((r) => r.path);
}

describe('deriveRows — model subject', () => {
  it('classifies writable leaves as inputs and computed leaves as validations', () => {
    const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
    const rows = deriveRows(service, MODEL_SUBJECT);

    expect(pathsIn(rows, 'inputs').sort()).toEqual(
      ['name', 'age', 'credit.balance', 'credit.limit', 'customer.name', 'customer.tier'].sort(),
    );
    expect(pathsIn(rows, 'validations').sort()).toEqual(
      ['maxLimit', 'creditDecision.approved', 'creditDecision.limit'].sort(),
    );
  });

  it('expands a user-defined input type into its own leaves, recursively', () => {
    const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
    const rows = deriveRows(service, MODEL_SUBJECT);
    const customerRows = rows.filter((r) => r.path.startsWith('customer'));
    expect(customerRows.map((r) => r.path).sort()).toEqual(['customer.name', 'customer.tier']);
    expect(customerRows.every((r) => r.section === 'inputs')).toBe(true);
  });

  it('does not expand an array-typed leaf', () => {
    const service = MutableDecisionService.fromCode('{ history: <number[]> }');
    const rows = deriveRows(service, MODEL_SUBJECT);
    expect(rows).toEqual([{ path: 'history', section: 'inputs', order: 0, type: 'array', present: true }]);
  });

  it('every freshly derived computed row lands in validations, never assertions', () => {
    const service = MutableDecisionService.fromCode(WORKBOOK_MODEL);
    const rows = deriveRows(service, MODEL_SUBJECT);
    expect(rows.some((r) => r.section === 'assertions')).toBe(false);
  });
});

describe('deriveRows — function/ruleset subjects', () => {
  it('derives parameter inputs and object-return leaves for a function', () => {
    const service = MutableDecisionService.fromCode(`{
      type Credit: { balance: <number>, limit: <number> }
      func creditDecision(name: string, age: number, credit: Credit, cap: number): {
        approved: if credit.balance >= 0 and age > 17 then true else false
        limit: if approved then cap else 0
      }
    }`);
    const rows = deriveRows(service, { id: 'creditDecision', kind: 'function', name: 'creditDecision' });
    expect(pathsIn(rows, 'inputs').sort()).toEqual(
      ['name', 'age', 'credit.balance', 'credit.limit', 'cap'].sort(),
    );
    expect(pathsIn(rows, 'validations').sort()).toEqual(['approved', 'limit'].sort());
  });

  it('a scalar-returning callable gets exactly one computed row at the empty path', () => {
    const service = MutableDecisionService.fromCode('{ func isEligible(age: number): age >= 18 }');
    const rows = deriveRows(service, { id: 'isEligible', kind: 'function', name: 'isEligible' });
    expect(pathsIn(rows, 'validations')).toEqual(['']);
    expect(rows.find((r) => r.path === '')?.type).toBe('boolean');
  });

  it('derives a ruleset the same way as a function', () => {
    const service = MutableDecisionService.fromCode(`{
      ruleset risk(age: number): {
        hitPolicy: "first-match"
        rules: [ { when: { age: 18..25 }, then: { level: "high", limit: 1000 } } ]
        default: { level: "none", limit: 0 }
      }
    }`);
    const rows = deriveRows(service, { id: 'risk', kind: 'ruleset', name: 'risk' });
    expect(pathsIn(rows, 'inputs')).toEqual(['age']);
    expect(pathsIn(rows, 'validations').sort()).toEqual(['level', 'limit'].sort());
  });
});

describe('deriveRows — optimise subject', () => {
  it('derives parameter inputs and the synthesized @result leaves, including bottlenecks', () => {
    const service = MutableDecisionService.fromCode(`{
      optimise factoryProduction(workers: number, sticks: number): {
        bottlenecks: true
        variables: { chairs: <number, integer: true, min: 0> }
        maximise: 15 * chairs
        constraints: { workerCapacity: 1 * chairs <= workers, stickSupply: 4 * chairs <= sticks }
      }
    }`);
    const rows = deriveRows(service, { id: 'factoryProduction', kind: 'optimise', name: 'factoryProduction' });
    expect(pathsIn(rows, 'inputs').sort()).toEqual(['workers', 'sticks'].sort());
    const validations = pathsIn(rows, 'validations');
    expect(validations).toEqual(
      expect.arrayContaining([
        'status',
        'objective',
        'chairs',
        'solver',
        'notes',
        'bottlenecks.workerCapacity',
        'bottlenecks.stickSupply',
      ]),
    );
  });
});

describe('deriveRows — loop subject', () => {
  it('derives parameter inputs and @return leaves, excluding @state', () => {
    const service = MutableDecisionService.fromCode(`{
      loop amortize(principal: number, payment: number): {
        state: { balance: principal, months: 0 }
        while: state.balance > 0
        maxIterations: 5
        do: { balance: state.balance - payment, months: state.months + 1 }
        return: { months: state.months }
      }
    }`);
    const rows = deriveRows(service, { id: 'amortize', kind: 'loop', name: 'amortize' });
    expect(pathsIn(rows, 'inputs').sort()).toEqual(['principal', 'payment'].sort());
    expect(pathsIn(rows, 'validations')).toEqual(['months']);
  });
});

describe('detectRenames', () => {
  const row = (path: string, overrides: Partial<TestRow> = {}): TestRow => ({
    path,
    section: 'inputs',
    order: 0,
    type: 'number',
    present: true,
    ...overrides,
  });

  it('pairs a unique same-section, same-type disappearance with a unique appearance', () => {
    const previous = [row('age'), row('credit.balance')];
    const derived = [row('yearsOld'), row('credit.balance')];
    expect(detectRenames(previous, derived)).toEqual([{ from: 'age', to: 'yearsOld' }]);
  });

  it('leaves ambiguous same-type candidates undetected rather than guessing', () => {
    const previous = [row('age'), row('score')];
    const derived = [row('yearsOld'), row('rating')];
    expect(detectRenames(previous, derived)).toEqual([]);
  });

  it('never pairs across sections or types', () => {
    const previous = [row('age', { section: 'inputs', type: 'number' })];
    const derived = [row('age2', { section: 'validations', type: 'number' })];
    expect(detectRenames(previous, derived)).toEqual([]);
  });

  it('never treats an already-deleted (present: false) row as a rename source', () => {
    const previous = [row('age', { present: false })];
    const derived = [row('yearsOld')];
    expect(detectRenames(previous, derived)).toEqual([]);
  });

  it('reports nothing when nothing changed', () => {
    const previous = [row('age')];
    expect(detectRenames(previous, previous)).toEqual([]);
  });

  it('detects a real rename end-to-end via deriveRows on two compiled models', () => {
    const before = MutableDecisionService.fromCode(WORKBOOK_MODEL);
    const after = MutableDecisionService.fromCode(WORKBOOK_MODEL.replace(/\bage\b/g, 'yearsOld'));
    const previousRows = deriveRows(before, MODEL_SUBJECT);
    const derivedRows = deriveRows(after, MODEL_SUBJECT);
    expect(detectRenames(previousRows, derivedRows)).toEqual([{ from: 'age', to: 'yearsOld' }]);
  });
});

describe('flattenResult', () => {
  it('flattens a nested plain object into dot-joined leaf paths', () => {
    expect(
      flattenResult({
        status: 'optimal',
        objective: 120,
        bottlenecks: { workerCapacity: 15, stickSupply: 0 },
      }),
    ).toEqual({
      status: 'optimal',
      objective: 120,
      'bottlenecks.workerCapacity': 15,
      'bottlenecks.stickSupply': 0,
    });
  });

  it('treats an array as one leaf, not exploded by index', () => {
    expect(flattenResult({ notes: ['a', 'b', 'c'] })).toEqual({ notes: ['a', 'b', 'c'] });
  });

  it('flattens a scalar top-level result to the single empty path', () => {
    expect(flattenResult(true)).toEqual({ '': true });
  });
});
