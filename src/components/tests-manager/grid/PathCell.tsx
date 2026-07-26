import Tooltip from '@mui/material/Tooltip';
import { useMemo, type ReactElement } from 'react';

// Self-contained Path-column sizing/truncation: `computePathColumnWidth` sizes the column from the
// longest row path (capped), `PathCell` then cuts the *front* of any path that still overflows —
// "..creditLine[0].balance" rather than "application.applicant.creditLine[0]..." — since the tail
// (the field itself) is what a reader needs, not the root it hangs off of.
export const PATH_COLUMN_MAX_WIDTH = 240;

// Reserves room, inside the column, for the drag handle + row-menu button + cell padding that sit
// alongside the path text (see `TestRowLine`) — the budget for the text itself is the rest.
const PATH_CELL_CHROME_WIDTH = 64;

// Heuristic px-per-character for the 13px monospace font `PathCell` renders in. jsdom has no real
// canvas 2D context (see vitest.setup.ts), so this avoids `measureText` entirely rather than adding
// a canvas dependency just for column sizing.
const MONO_CHAR_WIDTH = 7.3;

function estimateTextWidth(text: string): number {
  return text.length * MONO_CHAR_WIDTH;
}

// Longest path in `paths` -> column width, capped at `PATH_COLUMN_MAX_WIDTH` so a single deep path
// never blows out the whole grid; short models get a column no wider than they need.
export function computePathColumnWidth(paths: readonly string[]): number {
  const longest = paths.reduce((max, path) => Math.max(max, estimateTextWidth(path)), 0);
  return Math.min(PATH_COLUMN_MAX_WIDTH, Math.max(80, longest + PATH_CELL_CHROME_WIDTH));
}

// Cuts from the front of `path` until it fits `columnWidth`, prefixing the remainder with `..`.
// A path that already fits is returned unchanged.
export function truncatePath(path: string, columnWidth: number): string {
  const budget = Math.max(0, columnWidth - PATH_CELL_CHROME_WIDTH);
  if (estimateTextWidth(path) <= budget) return path;
  const ellipsis = '..';
  const maxChars = Math.max(1, Math.floor(budget / MONO_CHAR_WIDTH) - ellipsis.length);
  // Strip a leading '.' the cut may have landed on — ".." + ".creditLine" would otherwise read as
  // three dots instead of the intended two.
  const cut = path.slice(path.length - maxChars).replace(/^\.+/, '');
  return `${ellipsis}${cut}`;
}

export function PathCell({
  path,
  columnWidth,
  type,
}: {
  path: string;
  columnWidth: number;
  type?: string;
}): ReactElement {
  const label = path === '' ? '(result)' : path;
  const display = useMemo(
    () => (path === '' ? label : truncatePath(path, columnWidth)),
    [path, columnWidth, label],
  );
  const tooltip = type ? `${label} — ${type}` : label;

  return (
    <Tooltip title={display === label ? (type ?? '') : tooltip}>
      <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{display}</span>
    </Tooltip>
  );
}
