import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {buildChartDefinition, formatTick} from '../chartDefinition';
import {ChartView} from '../ChartView';
import {ROW_NUMBER, toDataset} from '../dataset';
import type {ChartConfig, ChartDataset} from '../types';

function dataset(value: unknown): ChartDataset {
    const result = toDataset(value);
    if ('error' in result) throw new Error(result.error);
    return result.dataset;
}

const schedule = dataset([
    {period: 1, interest: 125, principal: 635.55, balance: 24364.45},
    {period: 2, interest: 121.82, principal: 638.73, balance: 23725.72},
    {period: 3, interest: 118.63, principal: 641.92, balance: 23083.8},
]);

function draw(config: ChartConfig, data = schedule) {
    const {container} = render(<ChartView dataset={data} config={config} height={240} ariaLabel="Repayment" />);
    return container;
}

describe('buildChartDefinition', () => {
    it('keeps numeric positions for lines and areas over a numeric x', () => {
        expect(buildChartDefinition(schedule, {kind: 'line', x: 'period', series: ['balance']}).axis).toBe(
            'continuous',
        );
        expect(buildChartDefinition(schedule, {kind: 'area', x: ROW_NUMBER, series: ['balance']}).axis).toBe(
            'continuous',
        );
    });

    it('treats bars and text axes as categories', () => {
        expect(buildChartDefinition(schedule, {kind: 'bar', x: 'period', series: ['interest']}).axis).toBe(
            'categorical',
        );
        const cost = dataset({principal: 25000, interest: 2380});
        expect(buildChartDefinition(cost, {kind: 'line', x: 'name', series: ['value']}).axis).toBe('categorical');
    });
});

describe('ChartView', () => {
    it('names the chart surface', () => {
        draw({kind: 'line', x: 'period', series: ['balance']});
        expect(screen.getByRole('img', {name: 'Repayment'})).toBeInTheDocument();
    });

    it('draws one line per series and a legend for more than one', () => {
        const container = draw({kind: 'line', x: 'period', series: ['interest', 'principal']});
        expect(container.querySelectorAll('.ts-chart__line')).toHaveLength(2);
        expect(container.querySelector('.ts-chart__legend')).not.toBeNull();
    });

    it('draws a single series without a legend', () => {
        const container = draw({kind: 'line', x: 'period', series: ['balance']});
        expect(container.querySelector('.ts-chart__legend')).toBeNull();
    });

    it('draws one bar per row and series', () => {
        const container = draw({kind: 'bar', x: 'period', series: ['interest', 'principal'], stacked: true});
        expect(container.querySelectorAll('.ts-chart__bar path')).toHaveLength(6);
    });

    it('outlines an overlaid area with its line', () => {
        const container = draw({kind: 'area', x: 'period', series: ['interest', 'principal']});
        expect(container.querySelectorAll('.ts-chart__area path')).toHaveLength(2);
        expect(container.querySelectorAll('.ts-chart__line')).toHaveLength(2);
    });

    it('keeps the color of a series when another series is hidden', () => {
        const strokes = (series: string[]) =>
            [...draw({kind: 'line', x: 'period', series}).querySelectorAll('.ts-chart__line > path')].map((path) =>
                path.getAttribute('stroke'),
            );
        const [, principal] = strokes(['interest', 'principal']);
        expect(strokes(['principal'])).toEqual([principal]);
        expect(strokes(['interest'])).toEqual(['var(--ts-chart-1, #2563eb)']);
    });

    it('marks the chart kind for styling and tests', () => {
        draw({kind: 'bar', x: 'period', series: ['interest']});
        expect(screen.getByTestId('chart-view')).toHaveAttribute('data-chart-kind', 'bar');
    });
});

describe('formatTick', () => {
    it('shortens large numbers', () => {
        expect(formatTick(24364.45)).toBe('24.4K');
        expect(formatTick(125)).toBe('125');
    });
});
