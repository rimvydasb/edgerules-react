import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { useMemo, useState, type ReactElement } from 'react';
import type { TestRow } from '../../test-cases-service';
import { CodeEditorCell } from '../../code-editor-cell/CodeEditorCell';
import { useTestsManagerContext } from '../context/TestsManagerContext';
import { isKnownPath } from '../model/paths';
import { createPathLanguageService } from '../model/pathLanguage';

// Self-contained Path-column sizing/truncation: `computePathColumnWidth` sizes the column from the
// longest row path (capped), `PathCell` then cuts the *front* of any path that still overflows —
// "..creditLine[0].balance" rather than "application.applicant.creditLine[0]..." — since the tail
// (the field itself) is what a reader needs, not the root it hangs off of.
export const PATH_COLUMN_MAX_WIDTH = 240;

// Reserves room, inside the column, for the row-menu button + cell padding that sit alongside the
// path text (see `TestRowLine` — the drag handle lives in its own fixed-width column, so it isn't
// budgeted for here) — the budget for the text itself is the rest.
const PATH_CELL_CHROME_WIDTH = 40;

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

/**
 * The Path column's cell: read-only text until clicked, then a `CodeEditorCell` over the raw path.
 * Editing is how the user retargets a row — typically after **Duplicate** produced
 * `applicant[1].creditLine[0].balance` and they want `applicant[0].creditLine[2].balance` instead.
 *
 * A path that addresses nothing the model declares is shown in the error colour, while editing and
 * after, as is one that collides with another row or is not a well-formed path at all. Only a
 * collision (or an empty path) is actually refused on commit — any other path is the user's to
 * enter, wrong or not; the cell just says so.
 *
 * The editor runs against `createPathLanguageService`, not the model's own language service: a row
 * path is subject-relative and is only ever a path, so completions come from the subject's
 * addressable paths and diagnostics from the same check the read-only cell shows. See
 * `model/pathLanguage.ts`.
 */
export function PathCell({
  row,
  columnWidth,
  knownPaths,
}: {
  row: TestRow;
  columnWidth: number;
  knownPaths: ReadonlySet<string>;
}): ReactElement {
  const { testCasesService, readOnly } = useTestsManagerContext();
  const [draft, setDraft] = useState<string | undefined>(undefined);

  // `listRows()` returns a snapshot that only changes on mutation, so this memo re-runs when the
  // grid's rows actually change — not on every keystroke in the cell.
  const rows = testCasesService.listRows();
  const languageService = useMemo(
    () =>
      createPathLanguageService({
        knownPaths,
        takenPaths: new Set(rows.map((other) => other.path).filter((path) => path !== row.path)),
      }),
    [knownPaths, rows, row.path],
  );

  const label = row.path === '' ? '(result)' : row.path;
  const display = useMemo(
    () => (row.path === '' ? label : truncatePath(row.path, columnWidth)),
    [row.path, columnWidth, label],
  );

  // A scalar-returning callable's single row has no path to retarget; a deleted row's path is
  // history, not an address. Everything else is editable.
  const editable = !readOnly && row.path !== '' && row.present;
  const editing = draft !== undefined;

  const collides = (path: string): boolean =>
    path !== row.path && rows.some((other) => other.path === path);

  const invalidReason = (path: string): string | undefined => {
    if (collides(path)) return 'Another row already uses this path.';
    if (!isKnownPath(path, knownPaths)) return 'This path is not declared by the model.';
    return undefined;
  };

  const problem = invalidReason(draft ?? row.path);

  const commit = (text: string): void => {
    const next = text.trim();
    setDraft(undefined);
    if (next === '' || next === row.path) return;
    testCasesService.setRowPath(row.path, next);
  };

  if (editing) {
    return (
      <Box data-testid={`path-editor-${row.path || '(result)'}`}>
        <CodeEditorCell
          value={row.path}
          service={languageService}
          autoFocus
          onChange={setDraft}
          onCommit={commit}
          onCancel={() => setDraft(undefined)}
          sx={
            problem
              ? {
                  borderColor: 'error.main',
                  '&:focus-within': { borderColor: 'error.main' },
                }
              : undefined
          }
        />
      </Box>
    );
  }

  const typeSuffix = row.type ? ` — ${row.type}` : '';
  const tooltip = problem ? `${label}${typeSuffix} — ${problem}` : `${label}${typeSuffix}`;

  return (
    <Tooltip title={display === label && !row.type && !problem ? '' : tooltip}>
      <Box
        component="span"
        aria-label={`path ${label}`}
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={editable ? () => setDraft(row.path) : undefined}
        sx={{
          fontFamily: 'monospace',
          fontSize: 13,
          cursor: editable ? 'text' : 'default',
          color: problem ? 'error.main' : undefined,
        }}
      >
        {display}
      </Box>
    </Tooltip>
  );
}
