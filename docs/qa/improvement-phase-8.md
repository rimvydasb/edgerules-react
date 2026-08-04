# Phase 8 — Browser coverage: decision tables

**Area:** `e2e/boxed-editor/decision-tables.spec.ts` (new). **Test-only phase — no product code changes.**

**Goal:** the full decision-table (`ruleset`) CRUD matrix as it appears **inside** the Boxed Editor.

**Prerequisites:** [Phase 1](improvement-phase-1.md). Column rename/retype/reorder lives in
[Phase 4](improvement-phase-4.md); hit policy, priority and rule-form switching live in
[Phase 5](improvement-phase-5.md). This phase owns everything else.

**Fixtures:** `DecisionTableCrudPlayground` for mutation; `BlankModel` for the create-path tests.

---

## Why this phase exists

`e2e/decision-table/decision-table.spec.ts` covers the **standalone** `DecisionTableEditor` component
(`src/components/decision-table/`) — a different component entirely. The `ruleset`/`rule` rows rendered inside
`BoxedEditor` (`RulesetRow.tsx`, `RuleRow.tsx`, `RulesetDefaultRow.tsx`) have **zero** e2e coverage today. This is
the largest untested surface in the editor.

---

## Tasks

- [x] Create `e2e/boxed-editor/decision-tables.spec.ts` with `test.describe('Boxed Editor / decision tables')`.
- [x] Reuse `columnHelpers.ts` for header assertions rather than duplicating them from
      [Phase 9](improvement-phase-9.md)'s relation tests.
- [x] Every "add N times" test asserts **after each addition**, not just at the end. That is the difference between
      catching a compounding corruption immediately and needing a root-cause investigation.

### Creation and defaults

- [x] creates a decision table from scratch with a seeded hit policy and an empty default row
- [x] links immediately with zero rules, because the seeded default supplies the result type
- [x] renders no condition cells on a rule added before any condition column exists

  > Current behaviour per [Bug 9](current-bugs.md#bug-9--a-rule-can-never-be-authored-in-boolean-expression-form)'s
  > second note. If [Phase 5](improvement-phase-5.md) changed it, update this test to the new decision rather than
  > deleting it.

### Columns growing in lock-step

- [x] adds condition columns one at a time, growing every existing rule's cells in lock-step
- [x] adds action columns one at a time, growing every rule **and the default row's** cells in lock-step
- [x] leaves the default row's conditions untouched when a condition column is added

  > `addActionColumn` extends `ruleset-default`; `addConditionColumn` deliberately does not. Assert the asymmetry.

- [x] deletes a condition column and removes that cell from every rule
- [x] deletes an action column and removes that cell from every rule and the default row
- [x] deletes the last remaining condition column and keeps the table linkable

### Rules

- [x] adds a rule and seeds its action cells from an existing rule rather than blank literals

  > `appendRule` copies `referenceActions` from the first rule (or the default) because `then` shapes must match
  > exactly across every rule. A blind blank would not link.

- [x] duplicates a rule
- [x] deletes a rule
- [x] deletes the last remaining rule and keeps the table linkable
- [x] reorders rules by drag and changes first-match evaluation order accordingly
- [x] treats a blank condition cell as "any" and omits the key from the committed model
- [x] treats an all-blank rule as matching everything

### The default row

- [x] edits the pinned default row's action cells
- [x] offers no Delete and no Duplicate on the default row

### Execution matrix

- [x] executes an input that hits the first rule
- [x] executes an input that hits a later rule
- [x] executes an input that matches nothing and falls through to the default
- [x] executes a table whose conditions are numeric ranges
- [x] executes a table whose conditions are comparisons
- [x] executes a table whose conditions are string equality
- [x] re-executes correctly after a rule is deleted from the middle of the table

---

## Definition of done

- [x] 24 tests, all passing, all driving the UI only.
- [x] Every column/rule mutation is asserted cumulatively and through `live-result` or `live-model`.
- [x] Anything unreachable through the UI is filed in [`current-bugs.md`](current-bugs.md), not worked around.
- [x] `tsc --noEmit` clean.
