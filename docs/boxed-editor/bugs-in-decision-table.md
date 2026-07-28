# Decision Table Bugs

## QA scope

Tested on 2026-07-28 in the Storybook `Decision Table`, `Scorecard`, `Best Match Priorities`, and `Read Only` stories,
using Chromium and the real `@edgerules/web` mutable service. The existing Playwright decision-table suite was also run
as a regression baseline: all 5 tests passed. The list below therefore concentrates on uncovered business workflows,
destructive edge cases, and accessibility. “Missing” means that the operation has no UI affordance in the live editor;
“data loss” means the operation is present but replaces or removes authored model data without informed confirmation.

## Critical — silent data loss or incorrect rule semantics

- [ ] **DT-001 — Converting column conditions to an expression destroys every condition in the row.** Open a row menu
  for a row containing values such as `18..25`, `< 30000`, and `"retail"`, then choose **Use expression condition**.
  The editor replaces the complete condition with the literal `true`; it does not translate the conditions, preserve
  them for undo, or ask for confirmation. The rule consequently matches every input. Expected: preserve semantics by
  converting the cells to an equivalent expression, or require explicit confirmation before clearing them.

- [ ] **DT-002 — Converting an expression condition to column conditions destroys the expression.** On the third rule
  in the Decision Table story, choose **Use column conditions**. The expression
  `age >= 65 or segment = "premium"` is replaced by an empty condition map, so the rule matches every input. Expected:
  map a convertible expression to cells; otherwise block the operation or warn that the expression will be lost.

- [ ] **DT-003 — Adding a duplicate output-column name overwrites all values in the existing column.** Choose
  **Add output column…**, enter an existing name such as `level`, and submit. There is no client-side uniqueness check;
  the column builder writes the new empty-string value under that key for every rule and the default row. Expected:
  reject duplicate names without changing the model.

- [ ] **DT-004 — Renaming an output column to an existing output name can merge columns and discard values.** Open the
  `level` column menu, choose **Rename column…**, and enter `limit`. The rename builder creates duplicate object keys;
  one set of cell values wins and the other is lost (or the engine rejects the malformed change only after the dialog
  closes). Expected: validate uniqueness before writing and keep the dialog open with an inline error.

- [ ] **DT-005 — Adding a duplicate input-column name silently changes the existing parameter contract.** Choose
  **Add input column…**, enter an existing parameter such as `age`, choose another type, and submit. The parameter is
  overwritten while its old rule conditions remain. That can invalidate conditions/callers or change their meaning.
  Expected: reject an already-used parameter name.

- [ ] **DT-006 — Switching to Collect Matches silently and permanently deletes the default result.** In the Decision
  Table story change the hit policy from **First match** to **Collect matches**, then change back. The pinned default row
  is removed on the first change and is not restored. Expected: explain the incompatibility and ask before deleting
  the default, or retain it as inactive metadata so a reversible policy change restores it.

- [ ] **DT-007 — Switching away from Best Match permanently deletes authored priorities.** In the Best Match story
  change to another hit policy and then back to Best Match. Existing priorities are stripped, and returning to Best
  Match generates priorities from row order instead of restoring the business user's values. Expected: warn and
  confirm destructive removal, or preserve inactive priorities.

- [ ] **DT-008 — Destructive row, column, and default deletion has no confirmation or undo.** **Delete rule**,
  **Delete column**, and **Remove default row** write immediately. A single menu click can remove an entire populated
  column or rule, with no confirmation, undo, or recovery path. Expected: confirmation that names the affected data
  for destructive populated operations, plus undo where practical.

## High — core authoring workflows are absent or broken

- [ ] **DT-009 — The decision table/ruleset name cannot be changed.** The `risk` title is static text and neither the
  title nor the table menu offers Rename. A business user cannot give the decision a meaningful name or correct a
  typo. Expected: a rename action backed by the engine rename API, including reference updates and validation.

- [ ] **DT-010 — Input columns cannot be renamed.** Live testing shows that an input header menu contains only
  **Delete column**; output headers additionally expose **Rename column…**. Expected: allow parameter rename while
  updating row condition keys and call sites/references, or report affected references before applying it.

- [ ] **DT-011 — Input parameter types cannot be changed.** A type can be selected only while adding a parameter.
  There is no edit-type operation afterward, so a mistaken `string`/`number` choice requires deleting and rebuilding
  the column and its rules. Expected: edit the parameter type with validation of existing cells and callers.

- [ ] **DT-012 — Output type cannot be selected or changed.** **Add output column…** asks only for a name and initializes
  every rule/default to `''`, forcing the new column to be a string initially. There is no output-type control, making
  numeric, boolean, date, and structured result authoring unnecessarily destructive and error-prone.

- [ ] **DT-013 — Columns cannot be reordered.** Neither input nor output header menus contain move-left/move-right
  actions, and headers cannot be dragged. Users cannot arrange conditions/actions into business-readable order.
  Expected: keyboard-accessible move actions and/or drag-and-drop, preserving values and authored order.

- [ ] **DT-014 — Supported input types are artificially limited.** The Add Input dialog offers only eight scalar
  primitives. It cannot select model-defined types, arrays, optional values, or structured types supported by the
  portable schema. Expected: expose the types accepted by the engine/model, including reusable custom types.

- [ ] **DT-015 — There is no way to create or rename a score/output column in a scorecard.** The score header menu only
  offers deletion; the table menu intentionally hides **Add output column…**. Deleting the sole score column is still
  offered even though a scorecard requires it. Expected: prevent invalid deletion and provide an explicit supported
  way to change the score/result definition.

- [ ] **DT-016 — There is no safe bulk authoring workflow.** The grid lacks multi-cell selection, rectangular paste,
  fill/copy-down, and CSV/spreadsheet import/export. Business rule tables are commonly authored in bulk; requiring a
  double-click and individual commit for every cell makes non-trivial tables impractical.

- [ ] **DT-017 — There is no undo/redo or change history.** Every successful cell or structural edit is immediately
  persisted. Accidental edits, moves, conversions, and policy changes cannot be reverted from the editor.

- [ ] **DT-018 — Rows cannot be sorted or searched, and columns cannot be sorted/grouped.** The editor supplies only
  manual one-step row moves. Large tables cannot be inspected for duplicate/overlapping rules or organized by a
  business field. If sorting is introduced, it must be an explicit persisted reorder for order-dependent policies,
  not a silent visual sort.

- [ ] **DT-019 — No rule enable/disable control exists.** Testing a candidate rule requires deleting it or changing its
  condition. Expected: disable a row without losing its authored values, with a clear visual state.

- [ ] **DT-020 — No validation summary identifies all invalid or conflicting rules.** Validation is shown only after a
  rejected cell write. There is no table-level status for gaps, overlaps, duplicate priorities, unreachable rules, or
  type errors across the table. Expected: actionable diagnostics tied to the affected rows/cells.

## Medium — validation and interaction defects

- [ ] **DT-021 — Column-name dialogs accept any non-blank text instead of validating identifiers.** Names containing
  spaces/punctuation or reserved words can be submitted. The dialog closes before the engine error is shown above the
  table, forcing the user to reopen it and retype the name. Expected: inline identifier/uniqueness validation and keep
  the dialog open on failure.

- [ ] **DT-022 — Priority editing has no business validation.** The Best Match priority editor is a generic number
  input. It does not explain ordering, prevent blank/zero/negative/fractional values, or detect duplicate priorities
  before committing. Expected: enforce the engine's priority constraints and clearly flag duplicates.

- [ ] **DT-023 — Boundary row-move actions remain enabled but do nothing.** **Move up** is enabled for the first rule and
  **Move down** for the last rule. Clicking either silently closes the menu without changing anything. Expected:
  disable impossible actions.

- [ ] **DT-024 — Expression rows trap Right Arrow keyboard navigation.** Focus the spanning expression cell and press
  Right Arrow. The row registers only grid column 0 for that spanning cell, while the output begins after all input
  column indexes; navigation searches backward and focuses the same expression cell again. Expected: Right Arrow
  moves to the first output cell and Left Arrow from the first output returns to the expression cell.

- [ ] **DT-025 — Keyboard navigation cannot reach row action menus or the hit-policy control.** Arrow navigation is
  limited to display cells. There is no documented shortcut to open a row menu, add a rule, or operate a column,
  preventing a complete keyboard-only authoring workflow.

- [ ] **DT-026 — Empty annotation cells have no visible affordance.** They render as a completely blank focusable area;
  unlike condition cells, they do not show a dash or placeholder. Users cannot discover where to add a rule
  description without tabbing or guessing.

- [ ] **DT-027 — Column actions are icon-only and nearly hidden until hover.** The same vertical-ellipsis icon is used
  for every input/output column, with low default opacity. There is no visible indication that headers are editable,
  especially on touch devices where hover does not exist.

- [ ] **DT-028 — The parameter signature omits types and becomes ambiguous.** The toolbar shows only
  `(age, income, segment)`, although types materially affect valid conditions. Expected: show
  `(age: number, income: number, segment: string)` or provide an equally accessible schema view.

- [ ] **DT-029 — A failed edit loses the user's attempted value.** Rejected cell writes correctly restore the model,
  but the editor closes and only displays an alert. The invalid text is discarded, so the user cannot correct a small
  syntax/type error in place. Expected: keep the active editor open, preserve the attempted value, and show the
  diagnostic beside the cell.

- [ ] **DT-030 — There is no unsaved/in-progress edit warning.** Clicking or tabbing away commits on blur, while Escape
  cancels. The UI does not indicate edit mode or explain these semantics, so opening a menu/control can commit a
  partially typed expression unexpectedly.

## Low — accessibility and presentation

- [ ] **DT-031 — Read-only cells are still exposed as buttons and remain in the tab order.** In the Read Only story,
  every static cell uses `role="button"` and `tabIndex=0`, even though it has no action. Screen-reader and keyboard
  users encounter many inert “buttons.” Expected: use grid/gridcell semantics and remove inert cells from the action
  tab order.

- [ ] **DT-032 — The table is missing an accessible name and spreadsheet semantics.** The HTML table has no caption or
  `aria-label`; editable cells are generic buttons rather than `gridcell`s, and row numbers have no row-header scope.
  Expected: label the decision table and expose row/column relationships and selection/edit state.

- [ ] **DT-033 — Color is the primary distinction between input and output columns.** Inputs and outputs use lightly
  tinted headers but have no group labels such as **Conditions** and **Results**. The distinction is weak in low
  contrast, forced-colors, print, and for color-vision-deficient users.

- [ ] **DT-034 — Narrow viewports have no deliberate responsive treatment.** The toolbar, fixed-width hit-policy
  selector, and wide table overflow without a sticky rule-number/header/action column or a clearly styled scroll
  container. On a large business table users lose row and column context while scrolling.

- [ ] **DT-035 — Errors are detached from the operation that caused them.** Engine errors appear in one alert above the
  grid, without identifying the affected row/column or returning focus to it. On a large table it is difficult to find
  and correct the failing cell or structural action.
