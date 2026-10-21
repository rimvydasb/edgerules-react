import {areaY, barY, colorLegend, defineChart, group, lineY} from '@tanstack/charts';
import {scaleBand} from '@tanstack/charts/scales/band';
import {scaleLinear} from '@tanstack/charts/scales/linear';
import {scaleOrdinal} from '@tanstack/charts/scales/ordinal';
import {scalePoint} from '@tanstack/charts/scales/point';
import {tooltip} from '@tanstack/charts/tooltip';
import {columnLabel, findColumn, numericColumns, ROW_NUMBER} from './dataset';
import type {ChartConfig, ChartDataset} from './types';

/*
 * The only module that speaks the TanStack Charts grammar: a dataset and a ChartConfig in, a chart definition out.
 * Everything above it (dataset, config, form, node) is renderer-neutral.
 */

/** The TanStack default palette; chartNode.module.css maps these variables to Mantine colors. */
export const PALETTE = [
    'var(--ts-chart-1, #2563eb)',
    'var(--ts-chart-2, #f97316)',
    'var(--ts-chart-3, #10b981)',
    'var(--ts-chart-4, #8b5cf6)',
    'var(--ts-chart-5, #ec4899)',
    'var(--ts-chart-6, #06b6d4)',
];

/** Lines draw a dot at each point while there are few enough points to tell apart. */
const MAX_POINT_MARKERS = 40;

/** One observation of one series: the long format TanStack marks group by `z`. */
interface PlotRow<X> {
    id: string; // stable identity across updates: series and row position
    x: X;
    series: string;
    value: number | null; // a gap in a line; no bar
}

const compact = new Intl.NumberFormat(undefined, {notation: 'compact', maximumFractionDigits: 1});

export function formatTick(value: number): string {
    return compact.format(value);
}

function plotRows<X>(dataset: ChartDataset, config: ChartConfig, xOf: (cell: unknown) => X): PlotRow<X>[] {
    return dataset.rows.flatMap((row, index) =>
        config.series.map((series) => {
            const value = row[series];
            return {
                id: `${series}:${index}`,
                x: xOf(row[config.x]),
                series,
                value: typeof value === 'number' ? value : null,
            };
        }),
    );
}

/**
 * Series keep their color when other series are hidden: the color follows the column among the columns that can be
 * a series, not the legend position.
 */
function seriesColor(dataset: ChartDataset, config: ChartConfig) {
    const numeric = numericColumns(dataset)
        .map((column) => column.name)
        .filter((name) => name !== config.x);
    const colors = config.series.map((name) => PALETTE[Math.max(0, numeric.indexOf(name)) % PALETTE.length]);
    return {
        scale: scaleOrdinal(config.series, colors),
        legend: config.series.length > 1 ? colorLegend({placement: 'bottom'}) : undefined,
    };
}

function yScale(config: ChartConfig) {
    return {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: {
            ticks: {format: formatTick},
            label: config.series.length === 1 ? config.series[0] : undefined,
        },
    };
}

function xAxis(config: ChartConfig) {
    return {label: columnLabel(config.x), tickLabels: {thin: true}};
}

/** Lines and areas over a numeric x: positions keep their distances. */
function continuousChart(dataset: ChartDataset, config: ChartConfig) {
    const rows = plotRows(dataset, config, (cell) => (typeof cell === 'number' ? cell : null));
    const points = dataset.rows.length <= MAX_POINT_MARKERS;
    const line = lineY(rows, {id: 'series-line', x: 'x', y: 'value', z: 'series', points});
    const marks =
        config.kind === 'line'
            ? [line]
            : config.stacked
              ? [areaY(rows, {id: 'series-area', x: 'x', y: 'value', z: 'series', fillOpacity: 0.55})]
              : [areaY(rows, {id: 'series-area', x: 'x', y1: 0, y2: 'value', z: 'series', fillOpacity: 0.16}), line];
    return defineChart({
        marks,
        scales: {x: {scale: scaleLinear, axis: {...xAxis(config), ticks: {format: formatTick}}}, y: yScale(config)},
        color: seriesColor(dataset, config),
        tooltip,
    });
}

/** Any chart over text, dates or bars: x values are equally spaced categories in row order. */
function categoricalChart(dataset: ChartDataset, config: ChartConfig) {
    const rows = plotRows(dataset, config, (cell) => (cell === null || cell === undefined ? '' : String(cell)));
    const x = {
        scale: config.kind === 'bar' ? () => scaleBand<string>().padding(0.2) : () => scalePoint<string>().padding(0.3),
        axis: xAxis(config),
    };
    const points = dataset.rows.length <= MAX_POINT_MARKERS;
    const line = lineY(rows, {id: 'series-line', x: 'x', y: 'value', z: 'series', points});
    const marks =
        config.kind === 'bar'
            ? [
                  barY(rows, {
                      id: 'series-bar',
                      x: 'x',
                      y: 'value',
                      z: 'series',
                      radius: {end: 2},
                      layout: config.stacked || config.series.length === 1 ? undefined : group({padding: 0.1}),
                  }),
              ]
            : config.kind === 'line'
              ? [line]
              : config.stacked
                ? [areaY(rows, {id: 'series-area', x: 'x', y: 'value', z: 'series', fillOpacity: 0.55})]
                : [areaY(rows, {id: 'series-area', x: 'x', y1: 0, y2: 'value', z: 'series', fillOpacity: 0.16}), line];
    return defineChart({marks, scales: {x, y: yScale(config)}, color: seriesColor(dataset, config), tooltip});
}

/**
 * The TanStack chart definition of a config; build it once per dataset and config. The x value type differs per
 * axis kind, so the result is tagged: each branch renders its own `<Chart>` and keeps its inferred datum type.
 */
export type ChartDefinitionResult =
    | {axis: 'continuous'; definition: ReturnType<typeof continuousChart>}
    | {axis: 'categorical'; definition: ReturnType<typeof categoricalChart>};

export function buildChartDefinition(dataset: ChartDataset, config: ChartConfig): ChartDefinitionResult {
    const numericX = config.x === ROW_NUMBER || findColumn(dataset, config.x)?.kind === 'number';
    return numericX && config.kind !== 'bar'
        ? {axis: 'continuous', definition: continuousChart(dataset, config)}
        : {axis: 'categorical', definition: categoricalChart(dataset, config)};
}
