# Phase 2 — Commit pipeline & error visibility

**Area:** `src/components/boxed-editor/service/` (`createBoxedEditorService.ts`, `normalize.ts`, `denormalize.ts`),
`hooks/useRowActions.ts`, `rows/NewRow.tsx`. Plus the browser tests that prove it.

**Bugs:** [1](current-bugs.md#bug-1--untyped-functionoptimisation-argument-corrupts-on-round-trip),
[5](current-bugs.md#bug-5--errors-from-container-level-add--delete--actions-are-swallowed),
[6](current-bugs.md#bug-6--cannot-create-anything-even-after-the-underlying-error-is-fixed),
[11](current-bugs.md#bug-11--the-link-check-is-model-global-so-one-dangling-reference-freezes-every-subsequent-commit).

**Goal:** the editor never fails silently, and one broken row never freezes the whole model.

**Prerequisites:** [Phase 1](improvement-phase-1.md).

**Do this phase first among the fix phases.** Every other phase's "must fail visibly" assertion depends on the error
channel built here, and Bug 11's global latch will otherwise make unrelated phases look randomly broken.

---

## Tasks

### 2.1 Bug 1 — untyped argument round-trip guard — ~~DROPPED~~, fixed in the engine

The engine fixed the round-trip in `0.0.6-alpha.202607291629` (`toPortable()` now emits JSON `null` for an untyped
parameter), so **do not ship the `'null'`-string guard described here** — it would only make a user-defined type
literally named `null` unreferenceable, for nothing. `normalize.ts`/`denormalize.ts` already implement the documented
`null` contract and need no change.

- [x] ~~`service/normalize.ts` → `parametersOf` guard~~ — not needed
- [x] ~~`service/denormalize.ts` → `parameters()` guard~~ — not needed
- [x] Locked in instead by `normalization.test.ts` → "adds untyped function arguments one after another through the
      real engine": the editor's own read-modify-write cycle, three arguments deep, asserting the model still links.

### 2.2 Bug 5 — a visible error channel for menu and append actions

- [x] Add a shared per-row error channel — an alert surfaced next to the acting row, keyed by its path, with
      `role="alert"` and `data-testid="row-error-${path}"`. Match `ExpressionCell`'s existing inline-error behaviour
      as closely as makes sense so there is one error idiom, not two.
- [x] `hooks/useRowActions.ts` — stop discarding the `PortableError` returned by **every** mutating `onSelect`:
      `add-field`, `add-function`, `add-optimisation`, `add-ruleset`, `add-relation`, `add-list`, `add-argument`,
      `add-column`, `add-condition-column`, `add-action-column`, `add-rule`, `add-variable`, `add-constraint`,
      `delete`, `delete-column`, `delete-argument`, `duplicate`, `convert-to-*`, `switch-objective-direction`.
- [x] `rows/NewRow.tsx` — same for every `onActivate` append path (`appendListItem`, `appendRelationItem`,
      `appendRule`, `appendOptimisationVariable`, `appendOptimisationConstraint`, `nextFieldRow`).
- [x] The error must clear when the row's next mutation succeeds — a stale error is its own bug.

### 2.3 Bug 11 / Bug 6 — the model-global link latch

- [x] **Surface it.** In `setWithLinkCheck`, when the rollback is caused by a link error whose `path` is *not* the row
      being written, report it as a **model-level** problem naming the offending path — a persistent banner, not a
      transient per-row alert. Give it a stable `data-testid="model-error"`.
- [x] **Distinguish the two failure modes.** Snapshot linkability *before* the `set`; roll back only when the write
      made things worse. A link error that already existed must not block an unrelated, otherwise-valid write.
- [x] Decide and document what happens to `remove`/`rename`/`move` (they skip the link check today per Resolved
      Decision #12). At minimum they must trigger the model-level banner when they leave the model unlinkable —
      "succeeds silently and freezes the editor" is not an acceptable outcome. Bug 10's own fix lands in
      [Phase 6](improvement-phase-6.md); this phase only has to make the state *visible*.
- [x] Write down the decision in `docs/BOXED_EDITOR_STORY.md` (or wherever Resolved Decision #12 lives) so the next
      agent does not undo it.

---

## Browser tests

New file: `e2e/boxed-editor/commit-pipeline.spec.ts` —
`test.describe('Boxed Editor / commit pipeline')`. All gestures through the UI; see
[`qa-general-info.md`](qa-general-info.md) §1.3.

Bug 1:
- [x] adds two arguments in a row to a brand-new function and keeps both distinct
- [x] adds two arguments in a row to a function nested inside a context and keeps both distinct
- [x] adds five arguments one at a time, asserting after each click that every earlier argument survives
- [x] executes the function successfully after each argument is added

Bug 5:
- [x] shows a visible error when a menu action's commit is rejected, instead of silently doing nothing
- [x] shows a visible error when a trailing "(new …)" append is rejected
- [x] clears a row's error once its next mutation succeeds

Bugs 6 / 11:
- [x] keeps accepting unrelated edits after a rejected commit elsewhere in the model
- [x] names the offending path in a model-level banner after a referenced row is deleted
- [x] accepts an unrelated `Add field` while a dangling reference exists
- [x] clears the model-level banner once the dangling reference is repaired, and resumes normal editing

Every "should have succeeded" assertion above must check `live-result` or `live-model`, not row text alone
([`qa-general-info.md`](qa-general-info.md) §3).

---

## Optional pure-function supplements

Allowed, never a substitute for the browser tests above (`src/components/boxed-editor/__tests__/`):

- [x] `normalization.test.ts` — repeated `Add argument` on a function round-trips through the real engine and keeps
      every untyped parameter (replaces the obsolete `'null'`-string normalization check; see §2.1).
- [x] `mutation.test.ts` — an unrelated write still commits after a removal left another row's reference dangling.

---

## Definition of done

- [x] Clicking "Add argument" repeatedly on a fresh function works, in the browser, with the model still executing.
- [x] No mutating action anywhere in the editor can fail without the user seeing why.
- [x] Deleting a referenced row does not freeze the editor; the offending path is named on screen.
- [x] All 11 browser tests above pass; `tsc --noEmit` clean; existing suites still green.
- [x] [`current-bugs.md`](current-bugs.md) checkboxes for Bugs 1, 5, 6, 11 updated.
