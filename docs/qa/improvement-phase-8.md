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

- [ ] Create `e2e/boxed-editor/decision-tables.spec.ts` with `test.describe('Boxed Editor / decision tables')`.
- [ ] Reuse `columnHelpers.ts` for header assertions rather than duplicating them from
      [Phase 9](improvement-phase-9.md)'s relation tests.
- [ ] Every "add N times" test asserts **after each addition**, not just at the end. That is the difference between
      catching a compounding corruption immediately and needing a root-cause investigation.

### Creation and defaults

- [ ] creates a decision table from scratch with a seeded hit policy and an empty default row
- [ ] links immediately with zero rules, because the seeded default supplies the result type
- [ ] renders no condition cells on a rule added before any condition column exists

  > Current behaviour per [Bug 9](current-bugs.md#bug-9--a-rule-can-never-be-authored-in-boolean-expression-form)'s
  > second note. If [Phase 5](improvement-phase-5.md) changed it, update this test to the new decision rather than
  > deleting it.

### Columns growing in lock-step

- [ ] adds condition columns one at a time, growing every existing rule's cells in lock-step
- [ ] adds action columns one at a time, growing every rule **and the default row's** cells in lock-step
- [ ] leaves the default row's conditions untouched when a condition column is added

  > `addActionColumn` extends `ruleset-default`; `addConditionColumn` deliberately does not. Assert the asymmetry.

- [ ] deletes a condition column and removes that cell from every rule
- [ ] deletes an action column and removes that cell from every rule and the default row
- [ ] deletes the last remaining condition column and keeps the table linkable

### Rules

- [ ] adds a rule and seeds its action cells from an existing rule rather than blank literals

  > `appendRule` copies `referenceActions` from the first rule (or the default) because `then` shapes must match
  > exactly across every rule. A blind blank would not link.

- [ ] duplicates a rule
- [ ] deletes a rule
- [ ] deletes the last remaining rule and keeps the table linkable
- [ ] reorders rules by drag and changes first-match evaluation order accordingly
- [ ] treats a blank condition cell as "any" and omits the key from the committed model
- [ ] treats an all-blank rule as matching everything

### The default row

- [ ] edits the pinned default row's action cells
- [ ] offers no Delete and no Duplicate on the default row

### Execution matrix

- [ ] executes an input that hits the first rule
- [ ] executes an input that hits a later rule
- [ ] executes an input that matches nothing and falls through to the default
- [ ] executes a table whose conditions are numeric ranges
- [ ] executes a table whose conditions are comparisons
- [ ] executes a table whose conditions are string equality
- [ ] re-executes correctly after a rule is deleted from the middle of the table

---

## Definition of done

- [ ] 24 tests, all passing, all driving the UI only.
- [ ] Every column/rule mutation is asserted cumulatively and through `live-result` or `live-model`.
- [ ] Anything unreachable through the UI is filed in [`current-bugs.md`](current-bugs.md), not worked around.
- [ ] `tsc --noEmit` clean.
