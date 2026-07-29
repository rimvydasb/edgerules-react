# Phase 6 — Rename & reference integrity

**Area:** `src/components/boxed-editor/commands/useRowCommands.ts` (`rename`, `migrateOverlayPaths`),
`service/createBoxedEditorService.ts` (`rename`), `cells/NameCell.tsx`, and — depending on 6.1's decision — a liaison
task against `../edgerules-v2`. Plus the browser tests that prove it.

**Bug:** [10](current-bugs.md#bug-10--rename-never-migrates-references-silently-breaking-the-whole-model).

**Goal:** renaming something never silently breaks the model.

**Prerequisites:** [Phase 1](improvement-phase-1.md), [Phase 2](improvement-phase-2.md) (the model-level banner from
2.3 is how a rename failure becomes visible).

**Related:** [Phase 4](improvement-phase-4.md) implements column/argument rename. That work must not delegate to
`MutableDecisionService.rename` — this phase explains why.

---

## Why this phase exists

`rename()` rewrites the key and nothing else. Every expression referring to the old name is left byte-identical, and
the call returns `undefined` (success) with no validation:

```ts
const m = MutableDecisionService.fromCode('{ application: { loanAmount: 1000 } total: application.loanAmount * 2 }');
m.rename('application', 'app');   // → undefined (success)
m.link();
// throws: linker error: E102: unresolved reference 'application.loanAmount' in node NodeId(3)
```

The same holds at any depth. Combined with the model-global link check
([Bug 11](current-bugs.md#bug-11--the-link-check-is-model-global-so-one-dangling-reference-freezes-every-subsequent-commit)),
one innocuous rename can put the editor into a state where nothing else commits, and nothing on screen says why. This
is a rename button that corrupts models by default.

---

## Tasks

### 6.1 Decide where the fix belongs — do this first

- [ ] Read `../edgerules-v2/tests/wasm/crud.test.ts` and `doc/architecture/EDGERULES_CRUD_SPEC.md` to establish the
      *intended* contract for `rename`. The defect is already filed in `docs/BUG_REPORTS.md`.
- [ ] Choose and record the decision here:
  - [ ] **(1) Engine — preferred.** `rename` rewrites every reference to the renamed path; that is what distinguishes
        a rename from delete-and-recreate. Track the upstream fix; ship (3) in the meantime.
  - [ ] **(2) Editor.** Scan the portable tree for references to the old path, rewrite them, and commit the rename
        plus every rewrite as one operation, rolling everything back if the result does not link. Substantial, and it
        duplicates the engine's own name resolution — take this only if (1) is refused.
  - [ ] **(3) Minimum viable — ship regardless of 1/2.** Make `rename` link-check like `setBoxedRowData` does and
        surface the failure through [Phase 2](improvement-phase-2.md)'s channel. "Succeeds silently and freezes the
        editor" is not an acceptable outcome, whatever else is decided.

### 6.2 Implement

- [ ] Implement the chosen option in `createBoxedEditorService.rename` / `useRowCommands.rename`.
- [ ] Revisit Resolved Decision #12 explicitly (`remove`/`rename`/`move` skip the link check because they "may
      legitimately leave a *different* row's reference dangling"). Whatever the new behaviour is, write it down where
      that decision lives — a future agent will otherwise revert this.
- [ ] Apply the same reasoning to `remove` and `move`: a pre-flight warning ("`x` is still referenced by `y` — delete
      anyway?") is in scope here if it falls out of the same code path; otherwise file it as a follow-up.

### 6.3 Overlay migration — verify it actually works

`useRowCommands`'s `migrateOverlayPaths` migrates `DocumentationService` and `TestCasesService` paths after a
rename/move. **No test anywhere exercises it**, and the per-descendant loop (`DocumentationService.renamePath` matches
exact paths only, with no prefix awareness) is exactly the kind of code that rots unnoticed.

- [ ] Confirm a description survives a rename of its own row.
- [ ] Confirm a **nested** row's description survives a rename of its ancestor (the per-descendant loop).
- [ ] Confirm test-case cells survive both a rename and a drag-move.
- [ ] Confirm `collectSubtreePaths` captures the old shape *before* the commit, as its comment claims.

---

## Browser tests

New file: `e2e/boxed-editor/rename.spec.ts` — `test.describe('Boxed Editor / rename')`.

- [ ] renames a field no other row references and keeps the model executing
- [ ] renames a context that other rows reference, and every dependent expression follows
- [ ] renames a nested row that a sibling references, and the sibling's expression follows
- [ ] renames a function that another row calls, and the call site follows
- [ ] renames a row referenced from a decision table rule, and the rule follows
- [ ] renames a row referenced from an optimisation constraint, and the constraint follows
- [ ] reports a visible error instead of silently corrupting the model when a rename cannot be migrated
- [ ] keeps accepting unrelated edits after any rename
- [ ] migrates a row's description across a rename of that row
- [ ] migrates a nested row's description across a rename of its ancestor
- [ ] migrates test-case cells across a rename
- [ ] migrates test-case cells across a drag-move

If option (3) alone is shipped, the "…and every dependent expression follows" tests become `test.fixme` pending the
upstream fix — but the "reports a visible error" and "keeps accepting unrelated edits" tests must pass either way.
Do not weaken them.

---

## Definition of done

- [ ] Renaming anything either migrates references or fails visibly. Neither silently corrupts the model.
- [ ] The decision from 6.1 is recorded, both here and where Resolved Decision #12 lives.
- [ ] Overlay migration is proven by a browser test for the first time.
- [ ] All 12 browser tests pass (or the fixme'd subset is explicitly justified above); `tsc --noEmit` clean.
- [ ] [`current-bugs.md`](current-bugs.md) checkboxes for Bug 10 updated.
