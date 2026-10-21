import {describe, expect, it} from 'vitest';
import {axisColumns, columnLabel, numericColumns, ROW_NUMBER, toDataset} from '../dataset';
import type {ChartDataset} from '../types';

function dataset(value: unknown): ChartDataset {
    const result = toDataset(value);
    if ('error' in result) throw new Error(result.error);
    return result.dataset;
}

describe('toDataset', () => {
    it('turns a list of records into one row per record and one column per scalar field', () => {
        const table = dataset([
            {period: 1, balance: 100, note: 'first', paid: true, detail: {a: 1}},
            {period: 2, balance: 50, note: 'second', paid: false, detail: {a: 2}},
        ]);
        expect(table.columns).toEqual([
            {name: 'period', kind: 'number'},
            {name: 'balance', kind: 'number'},
            {name: 'note', kind: 'string'},
            {name: 'paid', kind: 'boolean'},
        ]);
        expect(table.rows[1]).toEqual({[ROW_NUMBER]: 2, period: 2, balance: 50, note: 'second', paid: false});
    });

    it('reads ISO date strings, as the engine returns dates, as a date column', () => {
        const table = dataset([
            {month: '2026-01-01', v: 1},
            {month: '2026-02-01T10:00:00Z', v: 2},
        ]);
        expect(table.columns[0]).toEqual({name: 'month', kind: 'date'});
    });

    it('keeps a text column with a few date-like values as text', () => {
        const table = dataset([{label: '2026-01-01'}, {label: 'later'}]);
        expect(table.columns).toEqual([{name: 'label', kind: 'string'}]);
    });

    it('fills a field that some records lack with null, and drops a column of mixed kinds', () => {
        const table = dataset([{a: 1, b: 'x'}, {b: 2}]);
        expect(table.columns).toEqual([{name: 'a', kind: 'number'}]);
        expect(table.rows[1].a).toBeNull();
    });

    it('turns a list of numbers into a value column', () => {
        const table = dataset([3, 1.5, null]);
        expect(table.columns).toEqual([{name: 'value', kind: 'number'}]);
        expect(table.rows.map((row) => row.value)).toEqual([3, 1.5, null]);
    });

    it('turns a record of numbers into name and value columns', () => {
        const table = dataset({principal: 25000, interest: 2380.4});
        expect(table.columns).toEqual([
            {name: 'name', kind: 'string'},
            {name: 'value', kind: 'number'},
        ]);
        expect(table.rows.map((row) => row.name)).toEqual(['principal', 'interest']);
    });

    it('explains the values it cannot chart', () => {
        expect(toDataset([])).toEqual({error: 'The list is empty'});
        expect(toDataset(['a', 'b'])).toEqual({error: 'Wire a list of records or a list of numbers'});
        expect(toDataset(42)).toHaveProperty('error');
        expect(toDataset({a: 'text'})).toHaveProperty('error');
    });
});

describe('dataset columns', () => {
    const table = dataset([{when: '2026-01-01', name: 'a', ok: true, v: 1}]);

    it('offers every column but a boolean one for the horizontal axis', () => {
        expect(axisColumns(table).map((column) => column.name)).toEqual(['when', 'name', 'v']);
    });

    it('offers numeric columns as series', () => {
        expect(numericColumns(table).map((column) => column.name)).toEqual(['v']);
    });

    it('labels the row position', () => {
        expect(columnLabel(ROW_NUMBER)).toBe('Row number');
        expect(columnLabel('period')).toBe('period');
    });
});
