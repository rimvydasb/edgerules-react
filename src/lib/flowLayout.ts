// The persisted Flow Editor canvas (`flow.json`). Plain data shared by `flow-editor`, which draws it, and
// `project-session`, which stores it; neither component imports the other for it.

/** Presentation data of the canvas (`flow.json`); the model holds the semantics. */
export interface FlowLayout {
    positions: Record<string, {x: number; y: number}>; // node id -> top-left canvas position (a ReactFlow XYPosition)
    outputs: FlowOutput[]; // output nodes exist on the canvas only
    charts?: FlowChart[]; // chart nodes exist on the canvas only; reported only when there are some
}

export interface FlowOutput {
    id: string; // node id, for example 'output' or 'output2'
    label?: string; // title; falls back to 'Output'
    source?: {node: string; handle: string}; // the result pin wired into the output
}

export interface FlowChart {
    id: string; // node id, for example 'chart' or 'chart2'
    label?: string; // title; falls back to 'Chart'
    source?: {node: string; handle: string}; // the result pin wired into the chart
    config?: ChartConfig; // undefined: configured automatically; a new wire clears it
    size?: {width: number; height: number}; // px; the default size when absent
}

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
