import {describe, expect, it} from 'vitest';
import {autoConfigure, canStack, MAX_AUTO_SERIES, resolveConfig} from '../autoConfig';
import {ROW_NUMBER, toDataset} from '../dataset';
import type {ChartDataset} from '../types';

function dataset(value: unknown): ChartDataset {
    const result = toDataset(value);
    if ('error' in result) throw new Error(result.error);
    return result.dataset;
}

const schedule = dataset([
    {period: 1, payment: 760.55, interest: 125, principal: 635.55, balance: 24364.45},
    {period: 2, payment: 760.55, interest: 121.82, principal: 638.73, balance: 23725.72},
    {period: 3, payment: 760.55, interest: 118.63, principal: 641.92, balance: 23083.8},
]);

describe('autoConfigure', () => {
    it('plots an amortization schedule as lines over its period', () => {
        expect(autoConfigure(schedule)).toEqual({
            kind: 'line',
            x: 'period',
            series: ['payment', 'interest', 'principal', 'balance'],
        });
    });

    it('draws a few text categories as bars', () => {
        expect(autoConfigure(dataset({principal: 25000, interest: 2380}))).toEqual({
            kind: 'bar',
            x: 'name',
            series: ['value'],
        });
    });

    it('draws many text categories as a line', () => {
        const rows = Array.from({length: 30}, (_, index) => ({name: `c${index}`, v: index}));
        expect(autoConfigure(dataset(rows))?.kind).toBe('line');
    });

    it('puts a date column on the horizontal axis', () => {
        expect(autoConfigure(dataset([{v: 1, month: '2026-01-01'}, {v: 2, month: '2026-02-01'}]))).toEqual({
            kind: 'line',
            x: 'month',
            series: ['v'],
        });
    });

    it('falls back to the row position when no column only grows', () => {
        const config = autoConfigure(dataset([{a: 3, b: 5}, {a: 2, b: 1}]));
        expect(config).toEqual({kind: 'line', x: ROW_NUMBER, series: ['a', 'b']});
    });

    it('keeps the only numeric column as a series rather than as the axis', () => {
        expect(autoConfigure(dataset([1, 2, 3]))).toEqual({kind: 'line', x: ROW_NUMBER, series: ['value']});
    });

    it(`stops at ${MAX_AUTO_SERIES} series`, () => {
        const record = Object.fromEntries(Array.from({length: 9}, (_, index) => [`s${index}`, index]));
        expect(autoConfigure(dataset([record, record]))?.series).toHaveLength(MAX_AUTO_SERIES);
    });

    it('has nothing to draw without a numeric column', () => {
        expect(autoConfigure(dataset([{name: 'a'}, {name: 'b'}]))).toBeUndefined();
    });
});

describe('resolveConfig', () => {
    it('configures automatically without a node config', () => {
        expect(resolveConfig(undefined, schedule)).toEqual({config: autoConfigure(schedule), origin: 'auto'});
    });

    it('keeps a node config that fits the data', () => {
        const config = {kind: 'bar' as const, x: 'period', series: ['interest', 'principal'], stacked: true};
        const resolved = resolveConfig(config, schedule);
        expect(resolved).toEqual({config, origin: 'custom'});
        expect(resolved.config).toBe(config);
    });

    it('drops the series the data no longer has', () => {
        const resolved = resolveConfig({kind: 'line', x: 'period', series: ['balance', 'fees']}, schedule);
        expect(resolved).toEqual({config: {kind: 'line', x: 'period', series: ['balance']}, origin: 'custom'});
    });

    it('falls back to the automatic config when the x column or every series is gone', () => {
        expect(resolveConfig({kind: 'line', x: 'month', series: ['balance']}, schedule).origin).toBe('fallback');
        expect(resolveConfig({kind: 'line', x: 'period', series: ['fees']}, schedule)).toEqual({
            config: autoConfigure(schedule),
            origin: 'fallback',
        });
    });
});

describe('canStack', () => {
    it('stacks areas and bars of more than one series', () => {
        expect(canStack({kind: 'area', x: 'period', series: ['a', 'b']})).toBe(true);
        expect(canStack({kind: 'bar', x: 'period', series: ['a']})).toBe(false);
        expect(canStack({kind: 'line', x: 'period', series: ['a', 'b']})).toBe(false);
    });
});
