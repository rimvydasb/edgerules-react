# Phase 9 — Browser coverage: relations, lists & drag-and-drop

**Area:** `e2e/boxed-editor/relations.spec.ts` (new), `e2e/boxed-editor/columnHelpers.ts`, additions to
`e2e/boxed-editor/fields-and-lists.spec.ts`. **Test-only phase — no product code changes.**

**Goal:** the two collection constructs (`relation`, `list`) and the row-level drag-and-drop that is fully wired and
entirely untested.

**Prerequisites:** [Phase 1](improvement-phase-1.md). Relation record appends against typed columns live in
[Phase 3](improvement-phase-3.md); column rename/retype/reorder lives in [Phase 4](improvement-phase-4.md).

**Fixtures:** `RelationCrudPlayground`, `CollectionsListAndRelation`, `BlankModel`.

---

## Why this phase exists

Relations are the other table-shaped construct, with their own quirks: no header-level column types (types are
inferred from the records and constrained to be identical across all of them), drill-down cells that render blank and
non-interactive, and an append path that is silently type-sensitive. And `dnd/dropRules.ts` — a 146-line drop matrix
consumed by `useRowDrag`/`useRowDrop` — has no browser coverage at all.

---

## Tasks

### 9.1 Shared column helpers

- [x] Fill in `e2e/boxed-editor/columnHelpers.ts` with the column assertions shared by `relation` and `ruleset`
      headers, so [Phase 8](improvement-phase-8.md) and this phase run the same checks against both constructs
      without duplicating a whole spec.
- [x] Keep them keyed on `column-${rowPath}-${columnName}` ([Phase 4](improvement-phase-4.md)'s testid).

### 9.2 Relations — `e2e/boxed-editor/relations.spec.ts`, `test.describe('Boxed Editor / relations')`

Columns:
- [x] adds columns one at a time, growing every existing record's cells in lock-step
- [x] deletes a column and removes that cell from every record
- [x] deletes the last remaining column and keeps the relation readable

Records:
- [x] adds a record to an empty relation
- [x] duplicates a record
- [x] deletes a record
- [x] deletes the last remaining record and keeps the relation linkable
- [x] reorders records by drag and reflects the new order in execution output

Cell types and homogeneity:
- [x] re-authors a column's cells from number to string across every record
- [x] rejects changing one record's cell to a type the other records do not share, with a visible error
- [x] leaves every other record untouched when such a change is rejected

Drill-down:
- [x] drills down into a record's complex-object cell and edits a nested field there
- [x] converts a flat cell into a drill-down by authoring a complex literal
- [x] renders a drill-down column's cell blank and non-interactive in the record row

  > `RelationCells` returns `null` for a drill-down column, so the transition is one-way from the UI's perspective:
  > once a cell holds an object, only the nested rows are editable. Assert that, or file it.

### 9.3 Lists — additions to `e2e/boxed-editor/fields-and-lists.spec.ts`

- [x] appends items to a string list, a numeric list and a boolean list with type-compatible defaults
- [x] rejects committing a mismatched literal into a homogeneous list, visibly
- [x] deletes the last item of a list and keeps the list linkable
- [x] reorders list items by drag and reflects the new order in execution output
- [x] converts a field into a list and back through the `Convert to …` actions

### 9.4 Drag and drop — `test.describe('Boxed Editor / drag and drop')` in `relations.spec.ts`

`dropRules.ts`'s `MOVABLE_KINDS` is the checklist: field, context, complexType, list, relation, function, ruleset,
optimisation, list-item, relation-item, rule, optimisation-variable, optimisation-constraint.

- [x] reorders rows within a container for every movable kind
- [x] reparents a row across containers where the drop matrix allows it
- [x] shows a rejecting outline and changes nothing when an invalid drop is attempted
- [x] appends by dropping onto a trailing "(new …)" placeholder
- [x] offers no drag handle for a non-movable kind (`ruleset-hit-policy`, `optimisation-setting`, `function-result`,
      `model`)
- [x] refuses a list-item drop whose literal kind does not match the target list
- [x] keeps the model executing after every accepted move

  > `@dnd-kit` ignores instantaneous pointer moves. Use `helpers.ts`'s `dragRow` (built in
  > [Phase 1](improvement-phase-1.md)) — a mouse-down, several intermediate moves, mouse-up sequence — not a single
  > `dragTo`.

---

## Definition of done

- [x] 35 tests, all passing, all driving the UI only (the final checklist expanded beyond the planning estimate of
      29).
- [x] `columnHelpers.ts` is shared by this phase and [Phase 8](improvement-phase-8.md), not duplicated.
- [x] Every accepted move and every accepted cell edit is asserted through `live-result` or `live-model`.
- [x] `tsc --noEmit` clean.
