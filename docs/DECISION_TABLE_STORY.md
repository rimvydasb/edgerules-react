# EdgeRules Decision Table Editor

A DMN-style decision table editor over an EdgeRules first-class `ruleset` (see
`../edgerules-v2/doc/reference/RULESETS_REFERENCE.md`). One grid metaphor covers the three shapes
enterprise rule engines converge on:

1. **Decision table** — cell-map `when` rows form a condition matrix over the parameters; the
   record-shaped `then` supplies one output column per field (nested records render as record
   literals inside a single column).
2. **Ruleset rows** — a rule whose condition is one boolean expression (`when: age >= 65 or
   segment = "premium"`) renders as a single cell spanning all input columns. Rows of both kinds
   mix freely, matching the engine.
3. **Scorecard** — when every rule's `then` is a bare scalar (typically with `collect-matches` and
   a downstream `sum(...)`, DMN's *Collect-Sum* pattern), outputs collapse to a single `score`
   column and the header shows a `scorecard` badge.

## Practices adopted from DMN tooling research

Surveyed: Camunda hit-policy guidance, dmn-js 4+ (bpmn.io) table UX, KIE/Kogito spreadsheet-like
DMN editor.

- **Hit policy is always visible** — a badge letter in the table's corner header (`F`/`U`/`C`/`P`)
  plus a labeled select in the toolbar, mirroring DMN's single-letter convention. Changing policy
  reconciles dependent fields the engine validates: switching to `collect-matches` drops the
  `default`; switching to `best-match` auto-assigns row priorities; switching away strips them.
- **Rows are ordered and numbered**; row operations (duplicate, move up/down, delete, convert
  condition kind) live in a per-row menu; a footer button appends rules.
- **`–` means "matches any"** (DMN's dash convention): an omitted `when` cell displays as a dimmed
  dash, and clearing a cell writes the column back as omitted.
- **Inputs and outputs are visually distinct** — tinted header groups (primary vs secondary),
  input columns left, outputs right, then priority (best-match only) and a free-text annotation
  column (the engine's rule `name`).
- **Spreadsheet editing without per-cell editors** (the dmn-js/KIE performance lesson): display
  cells are statically syntax-highlighted spans produced by a headless run of the shared
  CodeMirror StreamLanguage (`highlightEdgeRules`), with **zero** CodeMirror instances mounted.
  Exactly one `CodeEditorCell` (full diagnostics + completions) mounts on the cell being edited
  (double-click / Enter / F2), committing on Enter/blur and cancelling on Escape. Arrow keys move
  focus between display cells.
- **A pinned default row** at the bottom edits the ruleset's `@default` (hidden under
  `collect-matches`, where the engine forbids it).

## Engine integration

Props follow Project Explorer: `service` (a `MutableDecisionService` instance, structural
`get`/`set` subset) plus `path` to the ruleset; `languageService` (the dev-build class with static
`diagnostics`/`completions`) powers the active cell. Cell analysis runs through
`CodeEditorEmbedContext`s synthesized from the ruleset signature, so unary tests (`18..25`),
boolean `when` expressions, and `then` expressions lint against the right parameter types.

Write strategy (validated against the engine — see `BUG_REPORTS.md` ruleset findings):

- **Row edits → whole-rule `set`** (`risk.rules[2]`): the only write path that accepts unary-test
  sugar; cell-level `when` writes are rejected by the current engine (#1).
- **Structural edits → whole-ruleset `set`** (hit policy, row add/remove/reorder, column ops),
  as RULESETS_REFERENCE prescribes for hit-policy changes.
- **Failed writes restore the last good node**: the engine applies-then-links without rollback, so
  one rejected edit would otherwise poison the model (#2). The editor re-`set`s the previous
  rule/ruleset, keeps the grid consistent, and surfaces the `PortableError.message` in an alert.
- **Reads re-sugar the echo**: `get` denormalizes `18..25` to `... >= 18 and ... <= 25` (#5);
  `prettyUnaryTest` restores the compact form for display and editing.

Known engine-imposed limits (tracked in `BUG_REPORTS.md`): adding an input column to a ruleset
with existing call sites fails until the call sites pass the new argument (#7 — the engine error
is surfaced verbatim); `Missing` cannot be written as an output cell (#8 — new columns/rows fill
with `''`/`0`/`false` by output type).

## Files

- `src/components/decision-table/DecisionTableEditor.tsx` — the component.
- `src/components/decision-table/table-model.ts` — pure Portable ⇄ grid mapping and edit builders
  (unit-tested against the real engine echo).
- `src/components/code-editor/language/highlight.ts` — headless static highlighter shared with
  future boxed-expression displays.
- `stories/components/decision-table/DecisionTableEditor.stories.tsx` — decision table, scorecard,
  best-match, and read-only stories with a live execution result line.
