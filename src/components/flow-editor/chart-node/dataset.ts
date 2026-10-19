import type {ChartCell, ChartColumn, ChartDataset, ColumnKind, DatasetResult} from './types';

/** The x column that plots each row at its position, 1-based. Every dataset row carries it. */
export const ROW_NUMBER = '#';

// The engine returns `date` and `datetime` values as ISO strings.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function kindOf(value: unknown): ColumnKind | undefined {
    if (typeof value === 'number') return Number.isFinite(value) ? 'number' : undefined;
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') return ISO_DATE.test(value) ? 'date' : 'string';
    return undefined;
}

/** The common kind of a column's values; a column of mixed kinds or of nested values is left out. */
function columnKind(values: unknown[]): ColumnKind | undefined {
    let kind: ColumnKind | undefined;
    for (const value of values) {
        if (value === null || value === undefined) continue;
        const next = kindOf(value);
        if (!next) return undefined;
        // A text column with a few date-like values is still text.
        if (kind && kind !== next) {
            if ((kind === 'date' && next === 'string') || (kind === 'string' && next === 'date')) kind = 'string';
            else return undefined;
        } else {
            kind = next;
        }
    }
    return kind;
}

function fromRecords(records: Record<string, unknown>[]): ChartDataset {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const record of records) {
        for (const name of Object.keys(record)) {
            if (seen.has(name) || name === ROW_NUMBER) continue;
            seen.add(name);
            names.push(name);
        }
    }
    const columns: ChartColumn[] = [];
    for (const name of names) {
        const kind = columnKind(records.map((record) => record[name]));
        if (kind) columns.push({name, kind});
    }
    const rows = records.map((record, index) => {
        const row: Record<string, ChartCell> = {[ROW_NUMBER]: index + 1};
        for (const {name} of columns) row[name] = (record[name] as ChartCell | undefined) ?? null;
        return row;
    });
    return {columns, rows};
}

/**
 * An engine value as a chart table:
 * - a list of records: one row per record, one column per scalar field;
 * - a list of numbers: one row per number in a `value` column;
 * - a record of numbers: one row per field, with `name` and `value` columns.
 */
export function toDataset(value: unknown): DatasetResult {
    if (Array.isArray(value)) {
        if (value.length === 0) return {error: 'The list is empty'};
        if (value.every(isRecord)) return {dataset: fromRecords(value)};
        if (value.every((item) => item === null || typeof item === 'number')) {
            return {dataset: fromRecords(value.map((item) => ({value: item})))};
        }
        return {error: 'Wire a list of records or a list of numbers'};
    }
    if (isRecord(value)) {
        const entries = Object.entries(value);
        if (entries.length > 0 && entries.every(([, item]) => typeof item === 'number')) {
            return {dataset: fromRecords(entries.map(([name, item]) => ({name, value: item})))};
        }
    }
    return {error: 'Wire a list of records, a list of numbers or a record of numbers'};
}

export function numericColumns(dataset: ChartDataset): ChartColumn[] {
    return dataset.columns.filter((column) => column.kind === 'number');
}

/** Columns that can feed the horizontal axis: every column but a boolean one. */
export function axisColumns(dataset: ChartDataset): ChartColumn[] {
    return dataset.columns.filter((column) => column.kind !== 'boolean');
}

export function findColumn(dataset: ChartDataset, name: string): ChartColumn | undefined {
    return dataset.columns.find((column) => column.name === name);
}

export function columnLabel(name: string): string {
    return name === ROW_NUMBER ? 'Row number' : name;
}
