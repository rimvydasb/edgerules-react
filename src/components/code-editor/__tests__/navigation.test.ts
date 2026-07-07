import { describe, expect, it } from 'vitest';
import { findDefinition } from '../language/navigation';
import { VALID_MODEL_DSL } from '../testing/model.dsl';

function posOf(code: string, needle: string, offset = 0): number {
  const index = code.indexOf(needle);
  if (index < 0) {
    throw new Error(`needle not found: ${needle}`);
  }
  return index + offset;
}

describe('findDefinition', () => {
  const code = VALID_MODEL_DSL;

  it('resolves a root reference to its definition', () => {
    // `applicant` inside `riskScore(applicant.age)`
    const usage = posOf(code, 'riskScore(applicant', 'riskScore('.length + 2);
    const target = findDefinition(code, usage);
    expect(target).not.toBeNull();
    expect(code.slice(target!.from, target!.to)).toBe('applicant');
    expect(target!.from).toBe(posOf(code, 'applicant: {'));
  });

  it('resolves a function call to the func definition', () => {
    const usage = posOf(code, 'limit: riskScore', 'limit: r'.length);
    const target = findDefinition(code, usage)!;
    expect(code.slice(target.from, target.to)).toBe('riskScore');
    expect(target.from).toBe(posOf(code, 'func riskScore', 'func '.length));
  });

  it('resolves dotted member access through nested scopes', () => {
    const withUsage = `${code.slice(0, code.length - 1)}  cityRef: applicant.address.city\n}`;
    const usage = posOf(withUsage, 'applicant.address.city', 'applicant.address.ci'.length);
    const target = findDefinition(withUsage, usage)!;
    expect(withUsage.slice(target.from, target.to)).toBe('city');
    expect(target.from).toBe(posOf(withUsage, 'city: "Vilnius"'));
  });

  it('resolves an intermediate path segment to the nested object', () => {
    const withUsage = `${code.slice(0, code.length - 1)}  ref: applicant.address.city\n}`;
    const usage = posOf(withUsage, 'ref: applicant.address', 'ref: applicant.addr'.length);
    const target = findDefinition(withUsage, usage)!;
    expect(target.from).toBe(posOf(withUsage, 'address: {'));
  });

  it('resolves a parameter reference inside a func body', () => {
    const usage = posOf(code, 'score: income', 'score: inc'.length);
    const target = findDefinition(code, usage)!;
    expect(code.slice(target.from, target.to)).toBe('income');
    expect(target.from).toBe(posOf(code, 'income: number'));
  });

  it('resolves a type reference to its type definition', () => {
    const withType = `{
  type Customer: { name: <string> }
  buyer: <Customer>
}`;
    const usage = posOf(withType, '<Customer>', 3);
    const target = findDefinition(withType, usage)!;
    expect(target.from).toBe(posOf(withType, 'type Customer', 'type '.length));
  });

  it('returns null for unknown names, keywords, and non-word positions', () => {
    expect(findDefinition(code, posOf(code, 'func riskScore', 1))).toBeNull(); // inside `func`... resolves? 'func' has no def
    expect(findDefinition('{ a: unknownRef }', posOf('{ a: unknownRef }', 'unknownRef', 3))).toBeNull();
    expect(findDefinition(code, posOf(code, '{'))).toBeNull();
    expect(findDefinition(code, -1)).toBeNull();
    expect(findDefinition(code, code.length + 10)).toBeNull();
  });

  it('does not treat range dots as member access', () => {
    const rangeCode = '{ a: 10, b: for x in 1..a return x }';
    // `a` after `1..` must resolve to the root `a`, not fail as a member of `1`
    const usage = rangeCode.indexOf('..a') + 2;
    const target = findDefinition(rangeCode, usage)!;
    expect(target.from).toBe(rangeCode.indexOf('a: 10'));
  });

  it('never throws on broken source', () => {
    const broken = ['{ a: ', '{ a: { b: 1 ', 'a.b.c.', '{ func (', '"unterminated'];
    for (const source of broken) {
      for (let pos = 0; pos <= source.length; pos += 1) {
        expect(() => findDefinition(source, pos)).not.toThrow();
      }
    }
  });
});
