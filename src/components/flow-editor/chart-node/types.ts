import type {Node} from '@xyflow/react';

/** The chart kinds a ChartNode draws. */
export type ChartKind = 'line' | 'area' | 'bar';

/**
 * What a ChartNode paints. Plain data: the flow layout stores it. A node without a config is configured
 * automatically from the data wired into it.
 */
export interface ChartConfig {
    kind: ChartKind;
    x: string; // column of the horizontal axis, or ROW_NUMBER for the row position
    series: string[]; // numeric columns, one series each, in legend order
    stacked?: boolean; // area and bar only: stack the series instead of overlaying or grouping them
}

/** ReactFlow node data of a ChartNode. The data comes from the wire into the node, not from the node data. */
export type ChartNodeData = {
    label?: string; // title; falls back to 'Chart'
    config?: ChartConfig; // undefined: configured automatically from the wired data
};

export type ChartNodeType = Node<ChartNodeData, 'chartNode'>;

/** ChartNode internals: not part of the npm public API. */

/** Value family of a column; it decides which axis or series the column can feed. */
export type ColumnKind = 'number' | 'string' | 'date' | 'boolean';

export interface ChartColumn {
    name: string;
    kind: ColumnKind;
}

export type ChartCell = number | string | boolean | null;

/** An engine value as a table: the columns that hold scalars, and one row per list item or record field. */
export interface ChartDataset {
    columns: ChartColumn[]; // in first-seen order; ROW_NUMBER is never listed
    rows: Record<string, ChartCell>[];
}

export type DatasetResult = {dataset: ChartDataset} | {error: string};

/**
 * The config a ChartNode paints with and where it comes from: 'auto' when the node has none, 'custom' when the
 * node config fits the data, 'fallback' when it names columns the data no longer has.
 */
export interface ResolvedChartConfig {
    config?: ChartConfig; // undefined: the data has no numeric column to draw
    origin: 'auto' | 'custom' | 'fallback';
}

export interface ChartViewProps {
    dataset: ChartDataset;
    config: ChartConfig;
    height: number; // px of the plot area; the width follows the container
    ariaLabel: string;
}

export interface ChartConfigFormProps {
    dataset: ChartDataset;
    resolved: ResolvedChartConfig;
    onChange: (config: ChartConfig | undefined) => void; // undefined returns to automatic configuration
    onDone: () => void;
}

export interface ChartNodeMenuContext {
    flipped: boolean;
    configurable: boolean; // data is wired and has something to draw
    custom: boolean; // the node has its own config
    readOnly: boolean;
    onToggleConfigure: () => void;
    onResetConfig: () => void;
    onRemove: () => void;
}
