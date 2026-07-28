# Decision Table Bugs

## QA scope

Tested on 2026-07-28 in the Storybook `Decision Table`, `Scorecard`, `Best Match Priorities`, and `Read Only` stories,
using Chromium and the real `@edgerules/web` mutable service. The existing Playwright decision-table suite was also run
as a regression baseline: all 5 tests passed. The list below therefore concentrates on uncovered business workflows,
destructive edge cases, and accessibility. “Missing” means that the operation has no UI affordance in the live editor;
“data loss” means the operation is present but replaces or removes authored model data without informed confirmation.

## Fix pass — 2026-07-28

Went through the list below and fixed everything that was fixable inside this component. Each item marked `[x]` has
a description of what changed and, for anything user-facing, test coverage in
`src/components/decision-table/__tests__/`. Two engine-capability gaps found while fixing DT-010/DT-019 are filed in
`docs/BUG_REPORTS.md` rather than worked around here. Items left `[ ]` are feature-sized asks (bulk authoring,
full undo/redo history, a validation-summary dashboard, etc.) rather than bugs, and are called out individually with
why they were left for a follow-up.

## Critical — silent data loss or incorrect rule semantics

- [x] **DT-001 — Converting column conditions to an expression destroys every condition in the row.** Fixed:
  `buildExpressionFromCells` (`table-model.ts`) translates each non-empty cell (ranges, comparisons, `in`/`not`,
  literal equality, and recursive combinations of those via `and`/`or`) into the equivalent boolean-expression
  fragment and ANDs them together, verified round-tripping through the real engine. A bare-identifier cell (`age:
  isCore`) is the one case left unhandled on purpose — it's genuinely ambiguous (named-unary-test call vs. equality
  with a same-named field) without knowing the model's declarations, and guessing wrong would silently change the
  rule's meaning. That case (and anything else the translator doesn't recognize) blocks the conversion with an
  inline error instead of clearing the row.

- [x] **DT-002 — Converting an expression condition to column conditions destroys the expression.** Fixed:
  `parseExpressionToCells` decomposes a flat AND-only (or single-parameter OR) expression back into per-column cells,
  verified against the real engine. A cross-column `or` (exactly the reported case, `age >= 65 or segment =
  "premium"`) has no equivalent cell-map form, so it's refused with an inline error and the expression is left
  untouched — no data is lost either way.

- [x] **DT-003 — Adding a duplicate output-column name overwrites all values in the existing column.** Fixed: the
  Add Output dialog now rejects a name already in use, inline, without touching the model.

- [x] **DT-004 — Renaming an output column to an existing output name can merge columns and discard values.** Fixed:
  same uniqueness check on rename, inline error, dialog stays open.

- [x] **DT-005 — Adding a duplicate input-column name silently changes the existing parameter contract.** Fixed:
  same uniqueness check on Add Input.

- [x] **DT-006 — Switching to Collect Matches silently and permanently deletes the default result.** The engine
  itself forbids a default under `collect-matches` (this part isn't optional), but the editor now (a) asks for
  confirmation before making a destructive hit-policy change, naming what will be removed, and (b) caches the
  removed default for the session and restores it automatically if you switch back to a policy that supports one.

- [x] **DT-007 — Switching away from Best Match permanently deletes authored priorities.** Same session-cache
  treatment: priorities are cached before being stripped and restored (matched by row position) if you switch back
  to Best Match without changing the rows in between, instead of being regenerated from row order.

- [x] **DT-008 — Destructive row, column, and default deletion has no confirmation or undo.** Delete rule, delete
  column, and remove default row now open a confirmation dialog naming the affected data, and a successful
  destructive change shows an "Undo" snackbar that restores the previous definition in one click.

## High — core authoring workflows are absent or broken

- [x] **DT-009 — The decision table/ruleset name cannot be changed.** Fixed: a "Rename table…" action (visible when
  the host's service implements the engine's `rename` op) uses `rename(path, newPath)`, which relinks call sites per
  the engine's own CRUD tests. The component tracks the ruleset's current path internally so it keeps working
  immediately after a rename even if the host doesn't update its `path` prop right away; an `onRenamed` callback lets
  the host do so.

- [x] **DT-010 — Input columns cannot be renamed.** Fixed: input header menus offer "Rename column…", which calls
  `service.rename('<path>.parameters.<name>', '<path>.parameters.<newName>')`. `@edgerules/web`
  0.0.3-alpha.202607281554 extended `rename()` to target a ruleset's own parameters (previously `WrongFieldPath` —
  see the now-removed `docs/BUG_REPORTS.md` entry), and it relinks the cell-map `when` column, boolean-expression
  `when` rows, and external named-argument call sites in one engine-side operation — no caveat needed. A client-side
  rewrite of `@parameters` and cell-map `when` rows only (`withInputColumnRenamed` in `table-model.ts`) remains as a
  fallback for hosts on a service without `rename` support.

- [x] **DT-011 — Input parameter types cannot be changed.** Fixed: a "Change type…" action edits `@parameters[name
  ].type` (name field locked). Existing cells/call sites incompatible with the new type are still caught by the
  engine's normal link validation on write, surfaced the same way any other rejected structural edit is.

- [x] **DT-012 — Output type cannot be selected or changed.** Fixed: "Add output column…" now offers the same type
  choices as "Add input column…" and seeds every row/default with a real literal of that type (`0`, `false`,
  `date("2000-01-01")`, `duration("P0D")`, etc. — each verified against the real engine) instead of forcing `''`.
  Note the caveat: an output's type isn't a schema-declared field like a parameter's — it's inferred from the actual
  cell values after linking — so this is a better *default seed*, not a persisted type declaration.

- [ ] **DT-013 — Columns cannot be reordered.** Partially fixed: output columns can now be moved left/right (`Move
  left`/`Move right` in the column menu), safe because `then`/`default` are records matched by field name. Input
  columns are deliberately **not** reorderable: rulesets can be called positionally
  (`../edgerules-v2/doc/reference/RULESETS_REFERENCE.md` §"Invocation is a plain (named- or positional-argument)
  function call"), so reordering `@parameters` would silently rebind arguments at any positional call site — a worse
  silent-breakage risk than the bug being fixed. Doing this safely would need either detecting/disallowing
  positional call sites first, or an engine-side capability for it; left as a follow-up.

- [ ] **DT-014 — Supported input types are artificially limited.** Not fixed — this needs the component to receive
  the model's declared custom types/arrays/structured schemas, which isn't part of `DecisionTableEditorProps` today
  (it only receives a `path` and a CRUD-shaped service, not a type catalog). Expanding the type picker meaningfully
  is a props/architecture change, not a self-contained bug fix; left for a follow-up story.

- [x] **DT-015 — There is no way to create or rename a score/output column in a scorecard.** The "rename" half isn't
  applicable (a scorecard's single output is a bare scalar, not a named field, so there's nothing to rename — "Add
  output column…" stays hidden for scorecards, unchanged). Fixed the destructive half: "Delete column" is now hidden
  for a table's sole output column (scorecard or not) instead of being offered as a no-op that misleads.

- [ ] **DT-016 — There is no safe bulk authoring workflow.** Not fixed — multi-cell selection, rectangular paste, and
  CSV/spreadsheet import/export are a feature build, not a bug fix. Left as a follow-up.

- [ ] **DT-017 — There is no undo/redo or change history.** Partially addressed: destructive structural edits
  (delete rule/column, remove default, a destructive hit-policy change) now get a one-shot "Undo" snackbar (see
  DT-008). A full multi-step undo/redo history is a bigger feature and left as a follow-up.

- [ ] **DT-018 — Rows cannot be sorted or searched, and columns cannot be sorted/grouped.** Not fixed — feature-sized,
  left as a follow-up.

- [ ] **DT-019 — No rule enable/disable control exists.** Not fixed. The `PortableRule` schema has no `enabled`/
  `disabled` field (only `when`/`then`/`priority`/`name`), so a non-destructive implementation needs an engine schema
  change; abusing `when: false` client-side would either be non-persistent (lost on reload, since there's nowhere
  engine-side to stash the original condition) or itself destructive. Not filed as a `BUG_REPORTS.md` entry since it's
  a missing feature rather than a broken existing one — flagging here for the engine team's roadmap instead.

- [ ] **DT-020 — No validation summary identifies all invalid or conflicting rules.** Not fixed — a real
  gaps/overlaps/duplicate-priority/type-error analyzer is feature-sized, left as a follow-up.

## Medium — validation and interaction defects

- [x] **DT-021 — Column-name dialogs accept any non-blank text instead of validating identifiers.** Fixed: every
  naming dialog (add input/output, rename input/output, rename table) now validates an identifier shape and
  uniqueness inline before writing, and keeps the dialog open with the error shown next to the field on rejection
  (client-side or engine-side) instead of closing first.

- [x] **DT-022 — Priority editing has no business validation.** Fixed: a priority must be a positive whole number
  (blank/zero/negative/fractional rejected inline, without a round-trip to the engine); duplicate priorities across
  rows are now highlighted on the display cell.

- [x] **DT-023 — Boundary row-move actions remain enabled but do nothing.** Fixed: "Move up"/"Move down" are now
  disabled at the first/last row respectively.

- [x] **DT-024 — Expression rows trap Right Arrow keyboard navigation.** Fixed: the spanning expression cell's own
  grid position is now the last input-column index (so Right Arrow correctly computes the first output column as its
  target, and Left Arrow from that output correctly returns to the expression cell), while every earlier input
  column index is aliased to the same cell so vertical navigation from any of them still lands on it.

- [ ] **DT-025 — Keyboard navigation cannot reach row action menus or the hit-policy control.** Not fixed — the row
  menu button and hit-policy control are already reachable via ordinary Tab order (they were never removed from it),
  but there's still no arrow-key/grid-native shortcut to open a row menu from within grid navigation. A full
  roving-tabindex ARIA-grid redesign is the correct fix and is feature-sized; left as a follow-up.

- [x] **DT-026 — Empty annotation cells have no visible affordance.** Fixed: an empty annotation cell now shows a
  dim "+ note" placeholder (hidden in read-only tables, where there's nothing to add).

- [x] **DT-027 — Column actions are icon-only and nearly hidden until hover.** Fixed: default opacity raised (0.4 →
  0.7) and the icon now also shows at full opacity on keyboard focus, not just mouse hover.

- [x] **DT-028 — The parameter signature omits types and becomes ambiguous.** Fixed: the toolbar now shows
  `(age: number, income: number, segment: string)` via the existing (now exported) `parameterSignature` helper,
  instead of bare names.

- [x] **DT-029 — A failed edit loses the user's attempted value.** Fixed: a rejected cell write now keeps the active
  `CodeEditorCell` open showing exactly what was typed, with the engine's diagnostic shown inline beside it, instead
  of closing and only showing the top alert. Escape still cancels and reverts to the last good value.

- [ ] **DT-030 — There is no unsaved/in-progress edit warning.** Not fully fixed — the active cell editor already had
  a focus-ring/border treatment distinguishing edit mode from display mode, and DT-029 now also shows an inline error
  right at the cell instead of only a detached banner, but there's still no explicit "this will commit on
  blur/opening a menu" messaging. Left as a smaller follow-up.

## Low — accessibility and presentation

- [x] **DT-031 — Read-only cells are still exposed as buttons and remain in the tab order.** Fixed: in read-only
  mode, cells no longer get `role="button"` and are excluded from the Tab order (`tabIndex={-1}`), while staying
  programmatically focusable so arrow-key grid navigation still works.

- [ ] **DT-032 — The table is missing an accessible name and spreadsheet semantics.** Partially fixed: the table now
  has an `aria-label` naming the decision table. Full `gridcell`/row-header/selection-state semantics would need a
  broader markup change (editable cells aren't naturally `<th>`/`<td>` `gridcell`s in the ARIA grid pattern without
  a roving-tabindex rework) and is left as a follow-up alongside DT-025.

- [x] **DT-033 — Color is the primary distinction between input and output columns.** Fixed: an extra header row now
  labels the input and output column groups "Conditions" and "Results" respectively, in addition to the existing
  tinted backgrounds.

- [x] **DT-034 — Narrow viewports have no deliberate responsive treatment.** Partially fixed: the table now sits in
  its own horizontally-scrolling container so it no longer overflows the page uncontrolled. Sticky row-number/header/
  action columns for large tables are a further, separate improvement and left as a follow-up.

- [x] **DT-035 — Errors are detached from the operation that caused them.** Partially fixed via DT-029: a rejected
  cell edit now shows its diagnostic inline at the cell, not just in the top banner. Structural errors (column/
  hit-policy operations) still only surface in the top alert, since there's no single cell to anchor them to; left
  as a further improvement if needed.
