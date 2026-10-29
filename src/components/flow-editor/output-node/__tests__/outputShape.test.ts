import {describe, expect, it} from 'vitest';
import {cellKind, formatCell, isReduced, outputShape, shapeSummary} from '../outputShape';

describe('outputShape', () => {
    it('keeps single values on one line', () => {
        expect(outputShape(5)).toEqual({kind: 'scalar', text: '5'});
        expect(outputShape('high')).toEqual({kind: 'scalar', text: "'high'"});
        expect(outputShape(true)).toEqual({kind: 'scalar', text: 'true'});
        expect(outputShape(null)).toEqual({kind: 'scalar', text: 'null'});
        expect(outputShape({})).toEqual({kind: 'scalar', text: '{}'});
    });

    it('draws an empty list as an empty table with the declared item fields as columns', () => {
        expect(outputShape([])).toEqual({kind: 'list', items: []});
        const shape = outputShape([], ['clientId', 'worker']);
        expect(shape).toEqual({kind: 'table', columns: ['clientId', 'worker'], rows: []});
        expect(shapeSummary(shape)).toBe('0 rows × 2 columns');
    });

    it('marks a value as reduced past 10 rows or 5 columns', () => {
        const range = (count: number) => Array.from({length: count}, (_, index) => index);
        expect(isReduced(outputShape(range(10)))).toBe(false);
        expect(isReduced(outputShape(range(11)))).toBe(true);
        expect(isReduced(outputShape(Object.fromEntries(range(11).map((index) => [`f${index}`, index]))))).toBe(true);
        expect(isReduced(outputShape([{a: 1, b: 2, c: 3, d: 4, e: 5}]))).toBe(false);
        expect(isReduced(outputShape([{a: 1, b: 2, c: 3, d: 4, e: 5, f: 6}]))).toBe(true);
        expect(isReduced(outputShape(5))).toBe(false);
    });

    it('draws a list of values as a list', () => {
        expect(outputShape([1, 2, 3])).toEqual({kind: 'list', items: [1, 2, 3]});
        expect(outputShape([[1], [2]])).toEqual({kind: 'list', items: [[1], [2]]});
    });

    it('draws a list of records as a table with every field name as a column', () => {
        const shape = outputShape([
            {a: 1, b: 'x'},
            {a: 2, c: true},
        ]);
        expect(shape).toEqual({
            kind: 'table',
            columns: ['a', 'b', 'c'],
            rows: [
                {a: 1, b: 'x'},
                {a: 2, c: true},
            ],
        });
        expect(shapeSummary(shape)).toBe('2 rows × 3 columns');
    });

    it('draws a record as a table of fields', () => {
        const shape = outputShape({totalInterest: 120.5, totalPaid: 1000});
        expect(shape).toEqual({
            kind: 'record',
            entries: [
                ['totalInterest', 120.5],
                ['totalPaid', 1000],
            ],
        });
        expect(shapeSummary(shape)).toBe('2 fields');
        expect(shapeSummary(outputShape([7]))).toBe('1 item');
    });
});

describe('formatCell', () => {
    it('shows strings without quotes and a missing value as a dash', () => {
        expect(formatCell('prime')).toBe('prime');
        expect(formatCell(undefined)).toBe('—');
        expect(formatCell(0.04)).toBe('0.04');
    });

    it('shows nested values in short form', () => {
        expect(formatCell([1, 2])).toBe('[1, 2]');
        expect(formatCell([1, 2, 3, 4, 5, 6])).toBe('[6 items]');
        expect(formatCell({tier: 'prime', rates: [1, 2]})).toBe("{tier: 'prime', rates: [1, 2]}");
    });

    it('sorts values into cell kinds', () => {
        expect([1, 'a', false, null, {}].map(cellKind)).toEqual(['number', 'string', 'boolean', 'empty', 'nested']);
    });
});
