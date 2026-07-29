# Phase 5 — Settings pickers & rule authoring forms

**Area:** `src/components/boxed-editor/primitives/DropdownChip.tsx`, `rows/RulesetHitPolicyRow.tsx`,
`rows/OptimisationSettingRow.tsx`, `rows/RuleRow.tsx`, `rows/RulesetDefaultRow.tsx`, `menu/actions.ts`,
`hooks/useRowActions.ts`. Plus the browser tests that prove it.

**Bugs:** [8](current-bugs.md#bug-8--dropdownchip-settings-are-decorative-hit-policy-and-solver-settings-cannot-be-changed),
[9](current-bugs.md#bug-9--a-rule-can-never-be-authored-in-boolean-expression-form),
[14](current-bugs.md#bug-14--collect-matches-rulesets-are-unreachable-from-the-editor).

**Goal:** the settings that change what a construct *means* — hit policy, solver, rule form — become editable, and
the priority column stops being dead code.

**Prerequisites:** [Phase 1](improvement-phase-1.md), [Phase 2](improvement-phase-2.md).

---

## Why this phase exists

`DropdownChip` renders a label and a down-arrow icon with no click handler at all. So `hitPolicy` is frozen at
whatever the model was loaded with, which in turn means `RulesetRow`'s entire `showPriority` branch — the priority
header, every `RuleRow` priority cell, `commitPriority`'s validation — is unreachable from the UI. Meanwhile every
rule `appendRule` creates is cell-map form, and the boolean-expression form can only be reached by loading a model
that already uses it. Three bugs, one theme: the decision table's authoring modes are read-only.

---

## Tasks

### 5.1 Bug 8 — make `DropdownChip` a real picker

- [ ] Turn `DropdownChip` into an interactive control: `role="button"`, `aria-haspopup`, an MUI `Menu` of options,
      keyboard-operable. Keep the visual design; add the behaviour its own doc comment already promises.
- [ ] Drive the options from a per-consumer list, not a hardcoded array inside the primitive.
- [ ] `RulesetHitPolicyRow` — options `first-match`, `best-match`, `unique-match`, `collect-matches` (the engine's
      accepted set; anything else is `E302`). Commit through `setBoxedRowData` on the owning `ruleset` so the link
      check gates it.
- [ ] `OptimisationSettingRow` — solver backends for `using`, boolean for `bottlenecks`. `timeLimit` keeps its
      `ExpressionCell`; do not convert it.
- [ ] Add `bottlenecks` and `timeLimit` to the `optimisation` row's menu as `Add setting` items — today they have
      **no create path at all** (`nextOptimisationRow` seeds only `using`, and there is no `NewRow` config for
      `optimisation`). They are name-keyed children of the `optimise` declaration, so an append is an ordinary
      owner-coalesced write.
- [ ] Verify the priority column now appears and disappears correctly when switching to and from `best-match`
      (`RulesetRow`'s `showPriority`, header + every `RuleRow`).
- [ ] Verify `commitPriority`'s non-numeric guard (`Priority must be a whole number`) is reachable and surfaces
      visibly.

### 5.2 Bug 14 — make `collect-matches` reachable

- [ ] `collect-matches` rejects a `default` (`E306`), but `nextRulesetRow` always seeds one and `normalizeRuleset`
      marks it `deletable: false`. Make `default`'s deletability conditional on the current hit policy.
- [ ] Have the hit-policy picker drop the `default` row **in the same commit** when switching to `collect-matches`,
      and re-seed it when switching away. The two settings are not independently valid — commit them together or the
      intermediate state is unlinkable.
- [ ] Confirm the other three policies still require and keep a default.

### 5.3 Bug 9 — rule form switching

- [ ] Add a per-rule toggle — a menu action (`Switch to expression condition` / `Switch to column conditions`) or a
      chip in the conditions header — flipping `conditionsExpression` between `undefined` and a seeded value, in a
      single whole-`rule` commit.
- [ ] Going **expression → cell-map** must warn or clear rather than silently drop the authored expression. The two
      representations are not mechanically convertible; today `commitConditionCell` throws the expression away
      silently on the first column-cell edit. Fix that too.
- [ ] Decide what a rule with **zero** condition columns should render. Today it renders no condition cells at all —
      a freshly created rule on a freshly created decision table has nothing to click. Either seed a condition column
      with the table, or render a hint, or make expression form the default in that state. Record the decision here.

---

## Browser tests

New file: `e2e/boxed-editor/settings-and-rule-forms.spec.ts` —
`test.describe('Boxed Editor / settings and rule forms')`.

Hit policy:
- [ ] switches hit policy from first-match to best-match through the chip
- [ ] shows the priority column on the header and on every rule under best-match, and hides it again on switching back
- [ ] requires a priority on every rule under best-match
- [ ] rejects a non-numeric priority with a visible error
- [ ] switches to unique-match and executes a table that matches exactly one rule
- [ ] switches to collect-matches, dropping the default row in the same commit, and executes a table that collects
      several matches
- [ ] restores the default row when switching away from collect-matches
- [ ] operates the hit-policy chip by keyboard alone

Optimisation settings:
- [ ] changes the solver backend through the `using` chip
- [ ] adds a `timeLimit` setting to an optimisation that has none, and edits it
- [ ] adds a `bottlenecks` setting and toggles it
- [ ] executes the optimisation successfully after each setting change

Rule forms:
- [ ] switches a rule from cell-map conditions to a boolean expression, and back
- [ ] warns before discarding an authored expression when switching back to column conditions
- [ ] authors one cell-map rule and one expression rule in the same table and executes both
- [ ] behaves per the recorded decision when a rule has no condition columns yet

Every switch asserts through `live-result` — a hit-policy change with no effect on evaluation is a failed test.

---

## Definition of done

- [ ] Hit policy, solver backend and rule form are all changeable through the UI.
- [ ] The priority column is reachable, required under `best-match`, and validated.
- [ ] `collect-matches` is selectable and executes.
- [ ] `bottlenecks` and `timeLimit` can be added to an optimisation built from scratch.
- [ ] All 16 browser tests pass; `tsc --noEmit` clean.
- [ ] [`current-bugs.md`](current-bugs.md) checkboxes for Bugs 8, 9, 14 updated.
