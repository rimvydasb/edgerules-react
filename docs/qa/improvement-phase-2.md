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

### 2.1 Bug 1 — untyped argument round-trip guard

- [ ] `service/normalize.ts` → `parametersOf`: `if (parameter === null || parameter === 'null') return { name };`
- [ ] `service/denormalize.ts` → `parameters()`: guard the same way before the
      `else if (parameter.required === undefined)` branch, so a parameter whose `type` is exactly `'null'`
      denormalizes back to JSON `null`, not a type reference.
- [ ] Comment both with the engine version they work around (`0.0.5-alpha.202607291250`) and a pointer to
      `docs/BUG_REPORTS.md`, so the upgrade skill deletes them rather than inheriting them forever.
- [ ] Note the accepted side effect in the comment: a user-defined type literally named `null` becomes
      unreferenceable.

### 2.2 Bug 5 — a visible error channel for menu and append actions

- [ ] Add a shared per-row error channel — an alert surfaced next to the acting row, keyed by its path, with
      `role="alert"` and `data-testid="row-error-${path}"`. Match `ExpressionCell`'s existing inline-error behaviour
      as closely as makes sense so there is one error idiom, not two.
- [ ] `hooks/useRowActions.ts` — stop discarding the `PortableError` returned by **every** mutating `onSelect`:
      `add-field`, `add-function`, `add-optimisation`, `add-ruleset`, `add-relation`, `add-list`, `add-argument`,
      `add-column`, `add-condition-column`, `add-action-column`, `add-rule`, `add-variable`, `add-constraint`,
      `delete`, `delete-column`, `delete-argument`, `duplicate`, `convert-to-*`, `switch-objective-direction`.
- [ ] `rows/NewRow.tsx` — same for every `onActivate` append path (`appendListItem`, `appendRelationItem`,
      `appendRule`, `appendOptimisationVariable`, `appendOptimisationConstraint`, `nextFieldRow`).
- [ ] The error must clear when the row's next mutation succeeds — a stale error is its own bug.

### 2.3 Bug 11 / Bug 6 — the model-global link latch

- [ ] **Surface it.** In `setWithLinkCheck`, when the rollback is caused by a link error whose `path` is *not* the row
      being written, report it as a **model-level** problem naming the offending path — a persistent banner, not a
      transient per-row alert. Give it a stable `data-testid="model-error"`.
- [ ] **Distinguish the two failure modes.** Snapshot linkability *before* the `set`; roll back only when the write
      made things worse. A link error that already existed must not block an unrelated, otherwise-valid write.
- [ ] Decide and document what happens to `remove`/`rename`/`move` (they skip the link check today per Resolved
      Decision #12). At minimum they must trigger the model-level banner when they leave the model unlinkable —
      "succeeds silently and freezes the editor" is not an acceptable outcome. Bug 10's own fix lands in
      [Phase 6](improvement-phase-6.md); this phase only has to make the state *visible*.
- [ ] Write down the decision in `docs/BOXED_EDITOR_STORY.md` (or wherever Resolved Decision #12 lives) so the next
      agent does not undo it.

---

## Browser tests

New file: `e2e/boxed-editor/commit-pipeline.spec.ts` —
`test.describe('Boxed Editor / commit pipeline')`. All gestures through the UI; see
[`qa-general-info.md`](qa-general-info.md) §1.3.

Bug 1:
- [ ] adds two arguments in a row to a brand-new function and keeps both distinct
- [ ] adds two arguments in a row to a function nested inside a context and keeps both distinct
- [ ] adds five arguments one at a time, asserting after each click that every earlier argument survives
- [ ] executes the function successfully after each argument is added

Bug 5:
- [ ] shows a visible error when a menu action's commit is rejected, instead of silently doing nothing
- [ ] shows a visible error when a trailing "(new …)" append is rejected
- [ ] clears a row's error once its next mutation succeeds

Bugs 6 / 11:
- [ ] keeps accepting unrelated edits after a rejected commit elsewhere in the model
- [ ] names the offending path in a model-level banner after a referenced row is deleted
- [ ] accepts an unrelated `Add field` while a dangling reference exists
- [ ] clears the model-level banner once the dangling reference is repaired, and resumes normal editing

Every "should have succeeded" assertion above must check `live-result` or `live-model`, not row text alone
([`qa-general-info.md`](qa-general-info.md) §3).

---

## Optional pure-function supplements

Allowed, never a substitute for the browser tests above (`src/components/boxed-editor/__tests__/`):

- [ ] `normalization.test.ts` — a parameter whose portable value is the string `'null'` normalizes to an untyped
      parameter, not a type reference.
- [ ] `mutation.test.ts` — an unrelated write still commits after a removal left another row's reference dangling.

---

## Definition of done

- [ ] Clicking "Add argument" repeatedly on a fresh function works, in the browser, with the model still executing.
- [ ] No mutating action anywhere in the editor can fail without the user seeing why.
- [ ] Deleting a referenced row does not freeze the editor; the offending path is named on screen.
- [ ] All 11 browser tests above pass; `tsc --noEmit` clean; existing suites still green.
- [ ] [`current-bugs.md`](current-bugs.md) checkboxes for Bugs 1, 5, 6, 11 updated.
