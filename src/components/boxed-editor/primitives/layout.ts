// The whole treegrid is built on a strict 40 px cell unit: a row grows vertically only in 40 px
// steps (single-height 40, tall 80) and a cell grows horizontally only in 40 px steps. Column
// widths below are literal multiples of `CELL` so every row lines up without pixel offsets.

export const CELL = 40;

export const NAME_COLUMN_WIDTH = CELL * 8; // 320
export const VALUE_COLUMN_WIDTH = CELL * 12; // 480
export const ACTIONS_COLUMN_WIDTH = CELL; // 40
export const DESCRIPTION_COLUMN_WIDTH = CELL * 6; // 240
export const TEST_RESULTS_COLUMN_WIDTH = CELL * 6; // 240

export const ROW_HEIGHT = CELL; // 40
export const TALL_ROW_HEIGHT = CELL * 2; // 80

export type BoxedColumn = 'value' | 'description' | 'test-results';

export interface ColumnVisibility {
  showDescription: boolean;
  showTestResults: boolean;
}

/** Shared `grid-template-columns` for every row — description/test-results collapse together. */
export function gridTemplateColumns({
  showDescription,
  showTestResults,
}: ColumnVisibility): string {
  const columns = [
    `${NAME_COLUMN_WIDTH}px`,
    `${VALUE_COLUMN_WIDTH}px`,
    `${ACTIONS_COLUMN_WIDTH}px`,
  ];
  if (showDescription) columns.push(`${DESCRIPTION_COLUMN_WIDTH}px`);
  if (showTestResults) columns.push(`${TEST_RESULTS_COLUMN_WIDTH}px`);
  return columns.join(' ');
}
