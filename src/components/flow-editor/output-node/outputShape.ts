/**
 * How an OutputNode draws an engine value:
 * - `scalar`: one line of text, for a number, a string, a boolean, null, an empty list or an empty record;
 * - `list`: a list of other values, one row per item;
 * - `table`: a list of records, one row per record and one column per field name;
 * - `record`: a record, one row per field with the field name and its value.
 */
export type OutputShape =
    | {kind: 'scalar'; text: string}
    | {kind: 'list'; items: unknown[]}
    | {kind: 'table'; columns: string[]; rows: Record<string, unknown>[]}
    | {kind: 'record'; entries: [string, unknown][]};

/** The cell kind that selects the color and the alignment of a value. */
export type CellKind = 'number' | 'string' | 'boolean' | 'empty' | 'nested';

// A list of scalars this short shows its items inside a cell; a longer one shows its length.
const INLINE_ITEMS = 5;

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An engine value as one line: strings in quotes, lists and records in full. */
export function formatValue(value: unknown): string {
    return typeof value === 'string' ? `'${value}'` : (JSON.stringify(value) ?? String(value));
}

export function outputShape(value: unknown): OutputShape {
    if (Array.isArray(value)) {
        if (value.length === 0) return {kind: 'scalar', text: '[]'};
        if (value.every(isRecord)) {
            const columns: string[] = [];
            const seen = new Set<string>();
            for (const record of value) {
                for (const name of Object.keys(record)) {
                    if (seen.has(name)) continue;
                    seen.add(name);
                    columns.push(name);
                }
            }
            return {kind: 'table', columns, rows: value};
        }
        return {kind: 'list', items: value};
    }
    if (isRecord(value)) {
        const entries = Object.entries(value);
        return entries.length === 0 ? {kind: 'scalar', text: '{}'} : {kind: 'record', entries};
    }
    return {kind: 'scalar', text: formatValue(value)};
}

/** The size of a list, table or record, for the value row above it. */
export function shapeSummary(shape: OutputShape): string {
    const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
    switch (shape.kind) {
        case 'scalar':
            return shape.text;
        case 'list':
            return plural(shape.items.length, 'item');
        case 'table':
            return `${plural(shape.rows.length, 'row')} × ${plural(shape.columns.length, 'column')}`;
        case 'record':
            return plural(shape.entries.length, 'field');
    }
}

export function cellKind(value: unknown): CellKind {
    if (value === null || value === undefined) return 'empty';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') return 'string';
    return 'nested';
}

/**
 * A value inside a table cell. The column already says what it is, so strings have no quotes; a nested list or
 * record shows in short form.
 */
export function formatCell(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value;
    return formatNested(value);
}

function formatNested(value: unknown): string {
    if (Array.isArray(value)) {
        const inline = value.length <= INLINE_ITEMS && value.every((item) => cellKind(item) !== 'nested');
        if (inline) return `[${value.map(formatValue).join(', ')}]`;
        return `[${value.length} items]`;
    }
    if (isRecord(value)) {
        return `{${Object.entries(value)
            .map(([name, item]) => `${name}: ${typeof item === 'string' ? formatValue(item) : formatNested(item)}`)
            .join(', ')}}`;
    }
    return formatValue(value);
}
