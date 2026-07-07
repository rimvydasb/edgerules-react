import { describe, expect, it } from 'vitest';
import { formatEdgeRules } from '../language/format';

describe('formatEdgeRules', () => {
  it('re-indents by bracket depth', () => {
    const messy = `{
applicant: {
      age: 21
   address: {
city: "Vilnius"
        }
}
}`;
    expect(formatEdgeRules(messy)).toBe(`{
  applicant: {
    age: 21
    address: {
      city: "Vilnius"
    }
  }
}`);
  });

  it('normalizes spacing after colons and commas', () => {
    expect(formatEdgeRules('{ a:1,b:  2 ,  c : 3 }')).toBe('{ a: 1, b: 2, c: 3 }');
  });

  it('preserves strings and comments byte-for-byte', () => {
    const source = `{
  // a   comment   with   spaces
  name: "spaces   stay,   even:with,punctuation"
}`;
    expect(formatEdgeRules(source)).toBe(source);
  });

  it('does not break range and member-access operators', () => {
    const source = `{
  xs: [1, 2, 3]
  r: for i in 1..10 return xs[i].value
}`;
    expect(formatEdgeRules(source)).toBe(source);
  });

  it('collapses runs of blank lines to one and trims trailing whitespace', () => {
    const source = '{\n  a: 1   \n\n\n\n  b: 2\n}';
    expect(formatEdgeRules(source)).toBe('{\n  a: 1\n\n  b: 2\n}');
  });

  it('is idempotent', () => {
    const messy = '{\na:{b:1,   c: [1,2, 3]}\n// tail\n}';
    const once = formatEdgeRules(messy);
    expect(formatEdgeRules(once)).toBe(once);
  });

  it('is safe on syntactically broken input', () => {
    expect(() => formatEdgeRules('{ a: { b: ')).not.toThrow();
    expect(formatEdgeRules('')).toBe('');
    expect(formatEdgeRules('}}}')).toBe('}}}');
  });

  it('keeps a closing line aligned with its opener', () => {
    const source = '{\n  rules: [\n    { when: 1, then: 2 }\n  ]\n}';
    expect(formatEdgeRules(source)).toBe(source);
  });
});
