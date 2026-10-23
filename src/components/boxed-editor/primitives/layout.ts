// The whole treegrid is a square-ruled sheet with a strict 40 px step (`CELL`), like squared
// paper: a row grows vertically only in whole steps (single-height 40, tall 80) and every column —
// top-level or nested inside a value cell (ruleset/relation/argument sub-columns) — is a whole
// number of steps wide. Every cell draws its 1px line on its own last pixel (right and bottom), so
// all vertical lines fall on `k * CELL - 1` and all horizontal lines on `k * CELL - 1`: borders of
// different rows can never be offset from each other.

import type {BoxedRowData, BoxedRowKind, BoxedTableRowData} from '../boxed-editor-types';
import {GRID_STEP} from '#ui/grid';

export const CELL = GRID_STEP;

export const NAME_COLUMN_UNITS = 8;
/** Default value-column width; it widens (in whole steps) when a sub-grid needs more room. */
export const VALUE_COLUMN_UNITS = 12;
export const DESCRIPTION_COLUMN_UNITS = 6;
export const TEST_RESULTS_COLUMN_UNITS = 6;
/** Narrowest nested sub-column (rule condition/action, relation column, argument header). */
export const MIN_SUB_COLUMN_UNITS = 3;
/** Width of a ruleset's `priority` sub-column. */
export const PRIORITY_COLUMN_UNITS = 2;

export const NAME_COLUMN_WIDTH = CELL * NAME_COLUMN_UNITS; // 320
export const VALUE_COLUMN_WIDTH = CELL * VALUE_COLUMN_UNITS; // 480
export const ACTIONS_COLUMN_WIDTH = CELL; // 40
export const DESCRIPTION_COLUMN_WIDTH = CELL * DESCRIPTION_COLUMN_UNITS; // 240
export const TEST_RESULTS_COLUMN_WIDTH = CELL * TEST_RESULTS_COLUMN_UNITS; // 240

export const ROW_HEIGHT = CELL; // 40
export const TALL_ROW_HEIGHT = CELL * 2; // 80

export type BoxedColumn = 'value' | 'description' | 'test-results';

export interface ColumnVisibility {
    showDescription: boolean;
    showTestResults: boolean;
    /** Value-column width in steps; defaults to {@link VALUE_COLUMN_UNITS}. */
    valueUnits?: number;
}

/** Shared `grid-template-columns` for every row — description/test-results collapse together. */
export function gridTemplateColumns({
    showDescription,
    showTestResults,
    valueUnits = VALUE_COLUMN_UNITS,
}: ColumnVisibility): string {
    const columns = [`${NAME_COLUMN_WIDTH}px`, `${valueUnits * CELL}px`, `${ACTIONS_COLUMN_WIDTH}px`];
    if (showDescription) columns.push(`${DESCRIPTION_COLUMN_WIDTH}px`);
    if (showTestResults) columns.push(`${TEST_RESULTS_COLUMN_WIDTH}px`);
    return columns.join(' ');
}

/** Splits `total` steps into `count` whole-step tracks; leftover steps go to the leftmost tracks. */
export function splitUnits(count: number, total: number): number[] {
    if (count <= 0) return [];
    const base = Math.floor(total / count);
    const extra = total - base * count;
    return Array.from({length: count}, (_, index) => base + (index < extra ? 1 : 0));
}

/** Whole-step widths of a ruleset's sub-columns, shared by its header, rule, and default rows. */
export interface RulesetTracks {
    /** One entry per condition column (a single empty slot when there are none). */
    conditions: number[];
    /** One entry per action column (a single empty slot when there are none). */
    actions: number[];
    /** `undefined` when the hit policy has no `priority`. */
    priority?: number;
}

export function sum(units: number[]): number {
    return units.reduce((total, value) => total + value, 0);
}

function rulesetColumnCounts(row: BoxedTableRowData): {conditions: number; actions: number} {
    return {
        conditions: Math.max(row.parameters?.length ?? row.conditionColumns?.length ?? 0, 1),
        actions: Math.max(row.actionColumns?.length ?? 0, 1),
    };
}

export function rulesetTracks(row: BoxedTableRowData, valueUnits: number, showPriority: boolean): RulesetTracks {
    const counts = rulesetColumnCounts(row);
    const priority = showPriority ? PRIORITY_COLUMN_UNITS : undefined;
    const shared = splitUnits(counts.conditions + counts.actions, valueUnits - (priority ?? 0));
    return {
        conditions: shared.slice(0, counts.conditions),
        actions: shared.slice(counts.conditions),
        priority,
    };
}

/**
 * Row kinds that open a nested level: the row, its child rows, and its `(new …)` placeholder form
 * one block, closed by a double line (`primitives/Block.tsx`). Every other row is a single element
 * inside a block. Add a new container kind here and it is separated like the others.
 */
const BLOCK_KINDS = new Set<BoxedRowKind>([
    'context',
    'complexType',
    'list',
    'relation',
    'function',
    'ruleset',
    'optimisation',
    'optimisation-variable-group',
    'optimisation-constraint-group',
]);

export function isBlock(row: BoxedRowData): boolean {
    return BLOCK_KINDS.has(row.kind);
}

/** Steps the value column needs so no nested sub-column is narrower than {@link MIN_SUB_COLUMN_UNITS}. */
function requiredValueUnits(row: BoxedRowData): number {
    const table = row as BoxedTableRowData;
    switch (row.kind) {
        case 'ruleset': {
            const counts = rulesetColumnCounts(table);
            // Reserve the priority column unconditionally so switching hit policy never resizes the grid.
            return (counts.conditions + counts.actions) * MIN_SUB_COLUMN_UNITS + PRIORITY_COLUMN_UNITS;
        }
        case 'relation':
            return (table.columns?.length ?? 0) * MIN_SUB_COLUMN_UNITS;
        case 'function':
        case 'optimisation':
            return (table.parameters?.length ?? 0) * MIN_SUB_COLUMN_UNITS;
        default:
            return 0;
    }
}

/** Value-column width (in steps) that fits every sub-grid in `rows` and their descendants. */
export function valueColumnUnits(rows: BoxedRowData[]): number {
    let units = VALUE_COLUMN_UNITS;
    const visit = (row: BoxedRowData): void => {
        units = Math.max(units, requiredValueUnits(row));
        row.children?.forEach(visit);
    };
    rows.forEach(visit);
    return units;
}
