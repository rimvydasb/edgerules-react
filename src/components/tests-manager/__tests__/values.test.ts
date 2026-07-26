import { describe, expect, it } from 'vitest';
import { CellParseError, formatValue, matches, parseCell } from '../model/values';

describe('parseCell', () => {
  it('parses per the row type', () => {
    expect(parseCell('Steve', 'string')).toBe('Steve');
    expect(parseCell('30', 'number')).toBe(30);
    expect(parseCell('-100', 'number')).toBe(-100);
    expect(parseCell('true', 'boolean')).toBe(true);
    expect(parseCell('false', 'boolean')).toBe(false);
  });

  it('passes temporal cell text through unchanged', () => {
    expect(parseCell('2024-01-15', 'date')).toBe('2024-01-15');
    expect(parseCell('P1D', 'duration')).toBe('P1D');
  });

  it('parses array/user-type/any cells as JSON', () => {
    expect(parseCell('[1,2,3]', 'array')).toEqual([1, 2, 3]);
    expect(parseCell('{"name":"Ada"}', 'Customer')).toEqual({ name: 'Ada' });
  });

  it('an empty cell parses to undefined regardless of type', () => {
    expect(parseCell('', 'number')).toBeUndefined();
    expect(parseCell('', 'string')).toBeUndefined();
  });

  it('throws CellParseError for text that cannot be parsed for the type', () => {
    expect(() => parseCell('abc', 'number')).toThrow(CellParseError);
    expect(() => parseCell('yes', 'boolean')).toThrow(CellParseError);
    expect(() => parseCell('{not json', 'array')).toThrow(CellParseError);
  });
});

describe('formatValue', () => {
  it('formats scalars and special-value strings as-is', () => {
    expect(formatValue(30)).toBe('30');
    expect(formatValue(true)).toBe('true');
    expect(formatValue("Missing('credit')")).toBe("Missing('credit')");
    expect(formatValue(undefined)).toBe('');
  });

  it('summarizes an array by its length', () => {
    expect(formatValue(['a', 'b', 'c'])).toBe('3 items');
    expect(formatValue(['a'])).toBe('1 item');
  });
});

describe('matches', () => {
  it('an empty expectation always matches', () => {
    expect(matches('', 10000, 'number')).toBe(true);
  });

  it('does a type-directed, structurally deep comparison', () => {
    expect(matches('10000', 10000, 'number')).toBe(true);
    expect(matches('10000', 9999, 'number')).toBe(false);
    expect(matches('true', true, 'boolean')).toBe(true);
    expect(matches('[1,2,3]', [1, 2, 3], 'array')).toBe(true);
    expect(matches('[1,2,3]', [1, 2, 4], 'array')).toBe(false);
  });

  it('asserting a special value is just asserting its string form', () => {
    expect(matches("Missing('credit')", "Missing('credit')", 'number')).toBe(true);
  });

  it('unparseable expected text never matches', () => {
    expect(matches('abc', 10000, 'number')).toBe(false);
  });
});
