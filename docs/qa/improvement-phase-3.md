# Phase 3 — Creation affordances

**Area:** `src/components/boxed-editor/commands/rowFactories.ts`, `hooks/useRowActions.ts` (`pushContainerAdds`),
`menu/actions.ts`, `rows/NewRow.tsx`. Plus the browser tests that prove it.

**Bugs:** [7](current-bugs.md#bug-7--a-complextype-can-never-be-created-from-the-ui),
[12](current-bugs.md#bug-12--appending-a-record-to-a-relation-with-any-non-string-column-silently-does-nothing).

**Goal:** a business analyst starting from an empty model can create **every** construct the editor renders, and
every "add" gesture either works or says why.

**Prerequisites:** [Phase 1](improvement-phase-1.md), [Phase 2](improvement-phase-2.md) (the error channel — without
it, a failed creation is invisible and the tests below cannot assert anything).

---

## Why this phase exists

The editor can render, edit, duplicate and delete a `complexType` — but nothing can create one. Appending a record to
any relation with a numeric column silently does nothing. Both were invisible to the existing suite because every
test started from a story that already contained the thing it was testing. This phase closes the create path and
locks it down with a test that starts from `{}`.

---

## Tasks

### 3.1 Bug 7 — creating a complex type

- [x] `menu/actions.ts` — add an `add-complex-type` id with an icon.
- [x] `commands/rowFactories.ts` — add `nextComplexTypeRow(container, existingNames)`, mirroring the shape of
      `nextFunctionRow`/`nextRulesetRow`/`nextRelationRow`/`nextListRow`. Seed one `string` member; verify first
      whether an empty `type X: {}` links, and if it does, prefer the empty form.
- [x] `hooks/useRowActions.ts` — push `Add type` from `pushContainerAdds` for both `model` and `context`.
- [x] Verify the second half of the story works: a field can **reference** the new type
      (`application.applicant: <Applicant, required: true>`). Today that is only reachable by hand-typing the
      annotation into a value cell — decide whether that is acceptable or whether the type should be offerable from
      the field's own affordances, and record the decision here.
- [x] Confirm `complexTypeOwner`'s whole-type-rewrite coalescing in `createBoxedEditorService` handles a
      freshly-created type identically to a loaded one (it should; confirm, do not assume).

**Decision:** referencing a newly-created type through the field's existing expression editor is acceptable. The
annotation syntax (`<Type, required: true>`) is already the editor's general-purpose surface for all type metadata,
and the browser test below proves the newly-created definition is immediately linkable from it.

### 3.2 Bug 12 — appending a record to a typed relation

- [x] Extract `compatibleListItemDefault`'s coercion logic into a shared helper (`0` numeric, `false` boolean, `""`
      string, previous literal otherwise).
- [x] `appendRelationItem` — seed each cell from the **previous record's** literal for that column, through that
      helper, instead of a blind `BLANK_LITERAL`. Where no previous record exists, `""` stays correct.
- [x] Fix `appendRelationItem`'s doc comment: it currently claims a non-`string` column "needs the user's first real
      edit before it round-trips". It does not — the append itself never commits, so the user never gets that edit.
- [x] Leave `addRelationColumn`'s `BLANK_LITERAL` backfill as is (a brand-new column has no prior type to conflict
      with) and add a comment saying the asymmetry is deliberate.

### 3.3 Creation coverage sweep

Not a bug — a gap. Walk every container's creation surface and confirm each is reachable and each failure is visible:

- [x] `model` root: Add field, Add type, Add function, Add decision table, Add relation, Add list, Add optimisation.
- [x] `context`: the same **minus** Add optimisation (`pushContainerAdds(..., includeOptimisation=false)` — `optimise`
      may not be declared nested). Assert its absence; nothing tests that today.
- [x] `complexType`: Add field.
- [x] `function`: Add argument; the trailing "(new item)" that turns an inline body multi-statement.
- [x] `ruleset`: Add rule, Add condition column, Add action column; the trailing "(new rule)".
- [x] `relation`: Add column; the trailing "(new row)".
- [x] `list`: the trailing "(new item)".
- [x] `optimisation-variable-group` / `-constraint-group`: Add variable / Add constraint, and their trailing
      placeholders.
- [x] Record anything unreachable as a new entry in [`current-bugs.md`](current-bugs.md) rather than working around
      it in a test.

---

## Browser tests

New file: `e2e/boxed-editor/creation.spec.ts` — `test.describe('Boxed Editor / creation')`. **Every test in this file
starts from `BlankModel`.** No fixture may contain the construct the test is creating.

- [x] creates a complex type at the model root and links
- [x] creates a complex type inside a nested context
- [x] adds fields to a newly created complex type
- [x] references a newly created complex type from a field annotation
- [x] creates every construct the model root offers, one after another, from an empty model
- [x] offers Add optimisation on the model root and never inside a context
- [x] appends a record to a relation whose columns are numeric, and commits it
- [x] appends a record to a relation whose columns are boolean, and commits it
- [x] appends a record to an empty relation with no columns yet
- [x] appends items to a numeric list and to a boolean list with type-compatible defaults
- [x] auto-names successive constructs of the same kind without collision
- [x] shows a visible error, not a silent no-op, when a creation is rejected

Each "creates …" test must assert through `live-model` (and `live-result` where the construct is executable), not row
text alone — a rolled-back write leaves the DOM momentarily right.

---

## Optional pure-function supplements

- [x] `rowFactories` — `nextComplexTypeRow` produces a linkable node.
- [x] `rowFactories` — `appendRelationItem` seeds type-compatible cells from the previous record.

---

## Definition of done

- [x] Every one of the 21 row kinds is reachable from an empty model through the UI alone, or the exception is filed
      in [`current-bugs.md`](current-bugs.md) with a reason.
- [x] "(new row)" works on a relation with numeric, boolean and date columns.
- [x] All 12 browser tests pass; `tsc --noEmit` clean.
- [x] [`current-bugs.md`](current-bugs.md) checkboxes for Bugs 7 and 12 updated.
