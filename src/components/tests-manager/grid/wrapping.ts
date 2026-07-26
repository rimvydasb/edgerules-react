// Shared stepping for any row whose height must grow to fit wrapped text (Description, and the
// per-test-case header name): rows are always a multiple of `ROW_HEIGHT_STEP` — 40, 80, 120... —
// never an arbitrary in-between pixel value.
export const ROW_HEIGHT_STEP = 40;

export const DESCRIPTION_COLUMN_WIDTH = 160;
export const TEST_CASE_COLUMN_WIDTH = 160;

const CELL_TEXT_HORIZONTAL_PADDING = 16;
// Top + bottom cell padding (see the `8px` vertical padding in `TestRowLine`'s description
// textarea) — the line-count -> height conversion must budget for this too, or a row sized to fit
// its text exactly clips that text against the padding.
const CELL_TEXT_VERTICAL_PADDING = 16;

// Heuristic px-per-character for the ~13px proportional font Description/test-case-name text
// renders in. jsdom has no real canvas 2D context (see vitest.setup.ts), so this estimates wrapped
// line count without `measureText` rather than adding a canvas dependency just for row sizing.
const AVG_CHAR_WIDTH = 7.5;
const LINE_HEIGHT_PX = 20;

// Greedy word-wrap simulation: how many lines `text` needs at `columnWidth`. A single very long
// word that can't fit a line still counts as (at least) one line for that word, same as real wrap.
export function estimateWrappedLines(text: string, columnWidth: number): number {
  if (text.trim() === '') return 1;
  const charsPerLine = Math.max(1, Math.floor((columnWidth - CELL_TEXT_HORIZONTAL_PADDING) / AVG_CHAR_WIDTH));
  const words = text.split(/\s+/).filter(Boolean);
  let lines = 1;
  let currentLineLength = 0;
  for (const word of words) {
    const addition = currentLineLength === 0 ? word.length : currentLineLength + 1 + word.length;
    if (addition > charsPerLine && currentLineLength > 0) {
      lines += 1;
      currentLineLength = word.length;
    } else {
      currentLineLength = addition;
    }
  }
  return lines;
}

// Line count -> row height, snapped up to the next `ROW_HEIGHT_STEP`.
export function rowHeightForLines(lines: number): number {
  const needed = lines * LINE_HEIGHT_PX + CELL_TEXT_VERTICAL_PADDING;
  return Math.max(ROW_HEIGHT_STEP, Math.ceil(needed / ROW_HEIGHT_STEP) * ROW_HEIGHT_STEP);
}

// Convenience: text -> the row height it needs at `columnWidth`.
export function rowHeightForText(text: string, columnWidth: number): number {
  return rowHeightForLines(estimateWrappedLines(text, columnWidth));
}
