import {axisColumns, findColumn, numericColumns, ROW_NUMBER} from './dataset';
import type {ChartConfig, ChartDataset, ResolvedChartConfig} from './types';

/** Series beyond the palette size repeat colors, so the automatic config stops there. */
export const MAX_AUTO_SERIES = 6;
/** More categories than this make thin bars with unreadable labels; a line reads better. */
const MAX_BAR_CATEGORIES = 24;

function strictlyIncreasing(dataset: ChartDataset, name: string): boolean {
    let previous = -Infinity;
    for (const row of dataset.rows) {
        const value = row[name];
        if (typeof value !== 'number' || value <= previous) return false;
        previous = value;
    }
    return true;
}

/**
 * The horizontal axis: the first text or date column; else the first numeric column that only grows, such as a
 * period or a year, when another numeric column is left to draw; else the row position.
 */
function pickX(dataset: ChartDataset): string {
    const category = dataset.columns.find((column) => column.kind === 'string' || column.kind === 'date');
    if (category) return category.name;
    const numbers = numericColumns(dataset);
    if (numbers.length > 1) {
        const ordinal = numbers.find((column) => strictlyIncreasing(dataset, column.name));
        if (ordinal) return ordinal.name;
    }
    return ROW_NUMBER;
}

/**
 * The config the node uses until it is configured: every numeric column but the x column as a series, as bars
 * for a few text categories and as lines otherwise. Undefined when the data has no numeric column to draw.
 */
export function autoConfigure(dataset: ChartDataset): ChartConfig | undefined {
    const x = pickX(dataset);
    const series = numericColumns(dataset)
        .map((column) => column.name)
        .filter((name) => name !== x)
        .slice(0, MAX_AUTO_SERIES);
    if (series.length === 0) return undefined;
    const categorical = findColumn(dataset, x)?.kind === 'string';
    const kind = categorical && dataset.rows.length <= MAX_BAR_CATEGORIES ? 'bar' : 'line';
    return {kind, x, series};
}

function fits(config: ChartConfig, dataset: ChartDataset): ChartConfig | undefined {
    const xFits = config.x === ROW_NUMBER || axisColumns(dataset).some((column) => column.name === config.x);
    if (!xFits) return undefined;
    const numeric = new Set(numericColumns(dataset).map((column) => column.name));
    const series = config.series.filter((name) => numeric.has(name) && name !== config.x);
    if (series.length === 0) return undefined;
    return series.length === config.series.length ? config : {...config, series};
}

/**
 * The config to paint `dataset` with. A node config keeps the series the data still has; when its x column or
 * every series is gone, the automatic config takes over and the node config waits for data that fits it again.
 */
export function resolveConfig(config: ChartConfig | undefined, dataset: ChartDataset): ResolvedChartConfig {
    if (!config) return {config: autoConfigure(dataset), origin: 'auto'};
    const fitting = fits(config, dataset);
    if (fitting) return {config: fitting, origin: 'custom'};
    return {config: autoConfigure(dataset), origin: 'fallback'};
}

/** Area and bar charts can stack their series; a line chart cannot. */
export function canStack(config: ChartConfig): boolean {
    return config.kind !== 'line' && config.series.length > 1;
}
