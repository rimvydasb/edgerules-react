# Phase 10 — Browser coverage: editing semantics, naming, modes & overlays

**Area:** `e2e/boxed-editor/edge-cases.spec.ts` (new). **Test-only phase — no product code changes**, except adding
any missing `data-testid`/`aria-label` a test genuinely cannot work without.

**Goal:** everything that is not about one construct — how cells behave, what names are legal, what read-only means,
what the side columns do.

**Prerequisites:** [Phase 1](improvement-phase-1.md). Overlay *migration* across renames/moves is
[Phase 6](improvement-phase-6.md)'s; this phase covers overlay rendering and behaviour.

---

## Why this phase exists

None of these belong to a single construct, none are covered anywhere today, and several are the kind of thing a
business user hits within the first five minutes: renaming two things to the same name, deleting the last row of
something, pressing Escape mid-edit, clicking a second cell while one is open.

---

## Tasks

- [ ] Create `e2e/boxed-editor/edge-cases.spec.ts` with one `test.describe` per group below.

### Naming — `test.describe('Boxed Editor / naming')`

- [ ] rejects renaming a row to a name a sibling already uses
- [ ] handles a cleared name consistently across row kinds

  > `rowFactories.removeArgument`'s doc comment says a cleared argument name means *delete*. Establish what each kind
  > actually does; they should not differ arbitrarily. File any inconsistency.

- [ ] rejects a name containing a dot, which would corrupt path math
- [ ] rejects a name containing spaces or starting with a digit
- [ ] rejects an `@`-prefixed name, which collides with reserved metadata keys
- [ ] rejects or escapes a DSL keyword as a name (`func`, `ruleset`, `type`, `default`)
- [ ] accepts a non-ASCII name and keeps it addressable
- [ ] auto-names without collision after an intermediate row is deleted

### Empty and boundary states — `test.describe('Boxed Editor / boundaries')`

- [ ] creates and executes an empty list
- [ ] creates and executes an empty relation, and one with columns but no records
- [ ] creates and executes a function with zero arguments
- [ ] deletes a context's only child, then the context itself
- [ ] deletes the last field of a complex type
- [ ] renders a very long name without overflowing the row horizontally
- [ ] commits a very long expression and renders it truncated but editable
- [ ] stays responsive when editing the last row of the 200-row large model

### Editing semantics — `test.describe('Boxed Editor / editing')`

- [ ] keeps at most one expression cell active at a time
- [ ] cancels an edit with Escape and restores the previous value
- [ ] activates a focused static cell with Enter and with F2
- [ ] requires a value when a plain field's cell is cleared

  > `ExpressionCell.commit` short-circuits an empty value with `A value is required.` only when there is no
  > `onCommit` override — cells that rewrite their parent (rule cells, relation cells) legitimately accept blank.
  > Assert both sides.

- [ ] keeps an active cell's draft across an unrelated row's mutation
- [ ] reports a trailing-operator parse error with its specific message and clears it on a valid commit

  > `expressionErrorMessage` turns `application.loanAmount /` into `Expected a value after "/".` — a nicety nothing
  > currently proves reaches the screen.

- [ ] leaves every other row interactive while one row shows a commit error
- [ ] fires onChange exactly once per successful commit and never on a rejected one

### Modes — `test.describe('Boxed Editor / modes')`

- [ ] hides every mutating affordance in read-only mode
- [ ] keeps Duplicate and Expand/Collapse available in read-only mode

  > `useRowActions` filters on `nonMutating`. Nothing today asserts that the survivors survive — only that the
  > mutating ones are gone.

- [ ] hides every trailing "(new …)" placeholder in read-only mode
- [ ] disables description cells in read-only mode
- [ ] edits inside a focused subtree without touching paths outside it
- [ ] shows the fatal-path alert for a path that does not exist
- [ ] fires onOpenNode for the view-as-code action on model, function, ruleset and optimisation rows
- [ ] expands and collapses a ruleset, hiding and restoring its rules

  > `RulesetRow` gates its children on `isExpanded`; `RelationRow` does **not**, and `relation` has no
  > expand/collapse action at all. Assert the current behaviour of both and file the inconsistency — one of the two
  > is wrong.

- [ ] reveals every type tooltip while Alt is held

  > Covered by a unit test (`alt-reveal.test.tsx`) but never in a real browser, where the key handling actually
  > matters.

- [ ] documents the known-bad model-version behaviour until the engine metadata bug is fixed

  > `@model-version` edits are dropped by `set('*', …)` — already filed in `docs/BUG_REPORTS.md`. Assert the
  > **known-bad** behaviour with a comment naming that entry, so the test flips when the engine is fixed rather than
  > silently passing forever.

### Side columns — `test.describe('Boxed Editor / side columns')`

- [ ] types a description and persists it across a re-render
- [ ] omits the description and test-result columns entirely when disabled
- [ ] renders passing and failing test results per row
- [ ] coalesces a burst of edits into a single test run

  > Test-case *data* is seeded by the story through `TestCasesService` — the one sanctioned exception in
  > [`qa-general-info.md`](qa-general-info.md) §1.2, because this package ships no Test Case editor. The runner, the
  > engine and the results are all real. Specs read the rendered results only; they never seed.

### Accessibility — `test.describe('Boxed Editor / accessibility')`

- [ ] exposes the grid as a treegrid
- [ ] opens and operates a row-actions menu by keyboard alone
- [ ] reaches every row's actions button by tabbing

---

## Definition of done

- [ ] 38 tests, all passing, all driving the UI only.
- [ ] Every inconsistency found (expand/collapse, cleared names) is filed in
      [`current-bugs.md`](current-bugs.md) rather than silently accommodated.
- [ ] Any `data-testid`/`aria-label` added is listed in [`qa-general-info.md`](qa-general-info.md) §2.1.
- [ ] `tsc --noEmit` clean.
