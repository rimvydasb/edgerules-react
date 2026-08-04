# Phase 7 — Browser coverage: functions

**Area:** `e2e/boxed-editor/functions.spec.ts` (new). **Test-only phase — no product code changes.** If something
here cannot be done through the UI, file it in [`current-bugs.md`](current-bugs.md) rather than working around it.

**Goal:** the full function CRUD matrix, driven the way an analyst drives it.

**Prerequisites:** [Phase 1](improvement-phase-1.md). Argument rename/retype/reorder tests live in
[Phase 4](improvement-phase-4.md); the add-two-arguments regression lives in [Phase 2](improvement-phase-2.md). This
phase owns everything else about functions and must not duplicate those.

**Fixtures:** `FunctionCrudPlayground` for mutation of an existing signature; `BlankModel` for the create-path tests.

---

## What this phase must exercise

Functions are the row kind every confirmed bug was found in, and the one with the most structural variety: inline vs
multi-statement bodies, a synthesized `result` row that is never independently addressable while inline, nesting
inside contexts, and arguments that are positional at the call site.

---

## Tasks

- [x] Create `e2e/boxed-editor/functions.spec.ts` with `test.describe('Boxed Editor / functions')`.
- [x] Use the existing helpers (`openBoxedEditorStory`, `valueCell`, `commitExpression`, `renameRow`,
      `chooseRowAction`, `expectLiveResult`, `expectLiveModel`, `expectRowError`). Extend `helpers.ts` rather than
      inventing local ones.
- [x] Every structural edit below is followed by an execution assertion — a change that looks right in the DOM but
      breaks linking must fail the test.

### Creation and shape

- [x] creates a function at the model root with a blank result and no arguments
- [x] creates a function inside a nested context
- [x] creates a function three levels deep and keeps its path math correct
- [x] auto-names successive new functions without collision

### Body forms

- [x] converts an inline single-expression body into a multi-statement body
- [x] keeps the synthesized `result` row non-deletable and non-renameable while the body is inline
- [x] edits the result expression of an inline function and executes the new value
- [x] edits an intermediate field of a multi-statement function and executes the new value
- [x] records what happens when a multi-statement body is reduced back to one field

  > There is no "collapse back to inline" action. If deleting the extra body fields does not restore the inline form,
  > that is a finding for [`current-bugs.md`](current-bugs.md) — assert the actual behaviour, do not assert a
  > behaviour that does not exist.

### Arguments (the parts not owned by Phases 2 and 4)

- [x] deletes an argument the body does not reference
- [x] rejects deleting an argument the body does reference, with a visible error and an unchanged signature
- [x] deletes the only argument of a single-argument function
- [x] calls a function with each argument supplied and executes the expected result
- [x] adds an argument to a function that is already called elsewhere, and the call site still resolves

### Duplication and deletion

- [x] duplicates a function with auto-renaming
- [x] edits the duplicate's arguments and body without affecting the original
- [x] deletes a function nothing references
- [x] reports a visible, path-naming error when a called function is deleted, and still accepts unrelated edits

  > This is the function-shaped face of [Bug 11](current-bugs.md#bug-11--the-link-check-is-model-global-so-one-dangling-reference-freezes-every-subsequent-commit).
  > [Phase 2](improvement-phase-2.md) proves the mechanism; this proves it for functions specifically.

### Zero-argument and edge shapes

- [x] creates and executes a function with no arguments at all
- [x] executes a function whose body references a sibling context field
- [x] executes a nested function that references its enclosing context

**Engine contract note:** functions do not capture sibling or enclosing context fields (`E101`); those dependencies
must be declared and passed as parameters. The final two execution tests therefore drive sibling/enclosing values
through explicit arguments while still proving both root and nested scoping paths.

**Finding and fix:** deleting the extra fields initially left a one-field context body. The field deletion now
rewrites the owning function as a whole, restoring inline form; Bug 15 records the regression.

---

## Definition of done

- [x] 21 tests, all passing, all driving the UI only.
- [x] Every structural edit is followed by an execution assertion through `live-result`.
- [x] Anything unreachable through the UI is filed in [`current-bugs.md`](current-bugs.md), not worked around.
- [x] `tsc --noEmit` clean.
