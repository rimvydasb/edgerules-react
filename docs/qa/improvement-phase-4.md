# Phase 4 — Column & argument headers

**Area:** `src/components/boxed-editor/primitives/TypeName.tsx`, `primitives/ArgumentHeaders.tsx`,
`primitives/ColumnDragHandle.tsx`, `rows/RulesetRow.tsx` (`RulesetColumnHeaders`), `rows/RelationRow.tsx`
(`RelationColumnHeaders`), `menu/actions.ts`, `hooks/useRowActions.ts`, `commands/rowFactories.ts`
(`addConditionColumn`). Plus the browser tests that prove it.

**Bugs:** [2](current-bugs.md#bug-2--no-way-to-rename-a-function-argument-or-a-decision-table-column),
[3](current-bugs.md#bug-3--no-way-to-change-a-columnarguments-type-after-creation),
[4](current-bugs.md#bug-4--columnargument-drag-handles-are-decorative),
[13](current-bugs.md#bug-13--new-condition-columns-are-hardcoded-string-so-no-numeric-decision-table-is-buildable).

**Goal:** the header row of a function, decision table or relation stops being a read-only label and becomes the
editing surface it looks like — rename, retype, reorder.

**Prerequisites:** [Phase 1](improvement-phase-1.md), [Phase 2](improvement-phase-2.md).

---

## Why this phase exists

All four bugs are one defect wearing four hats: the header is rendered by `TypeName`, which is a `<span>` in a
tooltip, and `ColumnDragHandle`, which is an icon with a `grab` cursor and no event handlers. Everything a user
naturally tries on a column header — click the name, click the type, drag to reorder — does nothing. And because
`addConditionColumn` hardcodes `string`, a decision table can currently only express string equality, which makes the
construct nearly useless for real rules.

Fix them together: they touch the same three header components and the same whole-row commit path.

---

## Tasks

### 4.0 Testability first

- [x] Add `data-testid="column-${rowPath}-${columnName}"` to every column/argument header cell in `ArgumentHeaders`,
      `RulesetColumnHeaders` and `RelationColumnHeaders`. Without it, every test below has to match header text — and
      these are precisely the tests that rename that text. Do this before anything else in this phase.
- [x] Switch `helpers.ts`'s `columnHeaders()` (from [Phase 1](improvement-phase-1.md)) to the new testid.

### 4.1 Bug 2 — rename in place

- [x] `menu/actions.ts` — add `rename-argument` and `rename-column` ids.
- [x] Decide the affordance: a menu action, or a clickable header mirroring `NameCell`. Prefer the clickable header —
      it is what a user tries first — with the menu action as the discoverable alternative. Record the decision here.
- [x] Implement in-place rename per construct, each as **one** `setBoxedRowData` so `setWithLinkCheck` accepts or
      rejects the whole migration atomically:
  - [x] `function`/`optimisation` argument → `parameters[i].name` + every reference in the body/rules.
  - [x] `ruleset` condition column → `parameters` + the matching `when` key in **every** rule.
  - [x] `ruleset` action column → `actionColumns` + the matching `then` key in every rule **and** in
        `ruleset-default`.
  - [x] `relation` column → `columns` + every record's cell key.
- [x] Reference migration is the editor's job here — `MutableDecisionService.rename` migrates nothing
      ([Bug 10](current-bugs.md#bug-10--rename-never-migrates-references-silently-breaking-the-whole-model)). Do not
      delegate to it.
- [x] Reject a rename that collides with an existing sibling column/argument, visibly.

**Decision:** headers are directly clickable for name/type editing. The action registry also reserves
`rename-argument`/`rename-column` for discoverability, but the primary interaction stays in-place so it matches the
visual editing surface.

### 4.2 Bugs 3 & 13 — editable types

- [x] Make the header's **type** editable alongside its name, for the two kinds that actually have one:
      `function`/`optimisation` arguments and `ruleset` **condition** columns. Action columns and relation columns
      have no header-level type — see [Bug 3](current-bugs.md#bug-3--no-way-to-change-a-columnarguments-type-after-creation)'s
      scope table; do not invent a control for them.
- [x] Support the full matrix: `number`, `string`, `boolean`, `date`, a user `type X: {…}`, an array type (`T[]`),
      and the `required: true` variant (`denormalize.parameters()`'s third branch, which nothing currently
      exercises).
- [x] Retyping must re-validate every cell in that column **in the same commit** — a `string` column holding
      `"retail"` retyped to `number` fails as one atomic rejection, never leaves half a table committed.
- [x] `commands/rowFactories.ts` — stop hardcoding `'string'` in `addConditionColumn`. Prefer offering a type picker
      at column-creation time; if a default is unavoidable, pick one deliberately and say why in the comment.
- [x] Same review for `useRowActions`'s `optimisation` branch, which hardcodes `'number'` (defensible — `E331`
      requires a real annotation — but the user must be able to change it).

### 4.3 Bug 4 — column reorder

- [x] **Decide the semantics first and record it here.** For `function`/`optimisation`, argument order **is** the
      positional call-site order, so a reorder changes the meaning of every existing call — either rewrite call sites
      or refuse the reorder. For `ruleset`/`relation`, column order is presentational only (`when`/`then` and record
      cells are name-keyed), so a reorder is safe.
- [x] Implement one of:
  - [x] ~~Real column drag-and-drop~~ — explicitly not selected; the decorative handle was removed.
  - [x] **Selected:** remove `ColumnDragHandle` entirely and ship `Move left`/`Move right` menu actions. A missing feature is
        better than a false affordance; if drag is out of scope, say so and delete the handle.
- [x] Whichever is chosen, no decorative handle may remain in the shipped UI.

**Decision:** ship explicit, keyboard-accessible **Move left / Move right** controls and remove the decorative drag
handle from every consumer. Ruleset/relation moves rewrite cell arrays with their headers. Function/optimisation
parameters are reordered without rewriting named invocation arguments; EdgeRules' authored call sites in this
editor are name-keyed, and the browser test proves execution output is unchanged.

---

## Browser tests

New file: `e2e/boxed-editor/column-headers.spec.ts` — `test.describe('Boxed Editor / column headers')`. Runs against
`FunctionCrudPlayground`, `DecisionTableCrudPlayground` and `RelationCrudPlayground`; the shared assertions live in
`e2e/boxed-editor/columnHelpers.ts`.

Rename:
- [x] renames a function argument and migrates every reference in the body
- [x] renames a nested function's argument and migrates references at non-root depth
- [x] renames each of five arguments in turn, keeping every earlier rename intact
- [x] renames a condition column and migrates every rule's `when` key with the header
- [x] renames an action column and migrates every rule's and the default row's `then` key with the header
- [x] renames a relation column and migrates every record's cell key with the header
- [x] rejects renaming a column to a name a sibling column already uses, visibly and without partial changes

Retype:
- [x] changes an argument's type across number, string, boolean, date, a complex type, an array type and a required
      annotation
- [x] changes a condition column's type and keeps every rule cell valid
- [x] rejects a column retype that invalidates existing cells, leaving every cell unchanged
- [x] creates a condition column with a numeric type and authors a range condition against it
- [x] creates a condition column with a date type and authors a comparison condition against it

Reorder:
- [x] reorders ruleset columns and keeps every rule's cells aligned with the reordered header
- [x] reorders relation columns and keeps every record's cells aligned with the reordered header
- [x] reorders function arguments per the semantics chosen in 4.3, leaving execution output unchanged
- [x] offers no drag affordance where column reorder is unsupported

Every rename/retype/reorder test asserts through `live-result` or `live-model`, not header text alone.

---

## Definition of done

- [x] Every column and argument header can be renamed and (where it has one) retyped, through the UI.
- [x] A numeric decision table can be built from scratch — the direct unblocker for
      [Phase 8](improvement-phase-8.md) and [Phase 11](improvement-phase-11.md)'s Step 8.
- [x] No decorative drag handle remains.
- [x] `column-${rowPath}-${columnName}` testids exist on all three header components.
- [x] All 16 browser tests pass; `tsc --noEmit` clean.
- [x] [`current-bugs.md`](current-bugs.md) checkboxes for Bugs 2, 3, 4, 13 updated.
