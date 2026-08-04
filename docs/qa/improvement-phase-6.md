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

- [x] Read `../edgerules-v2/tests/wasm/crud.test.ts` and `doc/architecture/CRUD_SPEC.md` to establish the
      *intended* contract for `rename`. **Settled upstream** (`0.0.6-alpha.202607291629`, see
      `docs/BUG_REPORTS.md`): the current behaviour is by design. `rename` migrates references only for a
      `func`/`ruleset`/`loop` and its own declared parameters — verified: call sites, cell-map `when` keys and
      boolean-expression `when` rows all relink. For a plain field, context key or `type`, only the key moves and
      `link()` is the documented way to detect the fallout. `remove()` carries the same caveat.
- [x] Decision recorded: ship **option (3)** as the safety baseline, then add **option (2)** when the cumulative
      business-flow test demonstrated that visible rejection alone was insufficient for real maintenance work.
  - [x] ~~**(1) Engine — preferred.** `rename` rewrites every reference to the renamed path.~~ **Rejected upstream:**
        full refactoring is explicitly out of scope for the engine; `link()` exists to check the model after any
        mutation.
  - [x] **(2) Editor — implemented after the capstone proved (3) insufficient.** Scan the portable tree for
        references to the old identifier, rewrite declarations/call sites/expressions/cell-map keys, and commit the
        rename plus rewrites atomically with rollback if linking fails.
  - [x] **(3) Minimum viable — safety baseline.** Make `rename` link-check like `setBoxedRowData` does and
        surface the failure through [Phase 2](improvement-phase-2.md)'s channel. "Succeeds silently and freezes the
        editor" is not an acceptable outcome, whatever else is decided.

### 6.2 Implement

- [x] Implement the chosen option in `createBoxedEditorService.rename` / `useRowCommands.rename`.
- [x] Revisit Resolved Decision #12 explicitly (`remove`/`rename`/`move` skip the link check because they "may
      legitimately leave a *different* row's reference dangling"). Whatever the new behaviour is, write it down where
      that decision lives — a future agent will otherwise revert this.
- [x] Apply the same reasoning to `remove` and `move`: a pre-flight warning ("`x` is still referenced by `y` — delete
      anyway?") is in scope here if it falls out of the same code path; otherwise file it as a follow-up.

### 6.3 Overlay migration — verify it actually works

`useRowCommands`'s `migrateOverlayPaths` migrates `DocumentationService` and `TestCasesService` paths after a
rename/move. **No test anywhere exercises it**, and the per-descendant loop (`DocumentationService.renamePath` matches
exact paths only, with no prefix awareness) is exactly the kind of code that rots unnoticed.

- [x] Confirm a description survives a rename of its own row.
- [x] Confirm a **nested** row's description survives a rename of its ancestor (the per-descendant loop).
- [x] Confirm test-case cells survive both a rename and a drag-move.
- [x] Confirm `collectSubtreePaths` captures the old shape *before* the commit, as its comment claims.

---

## Browser tests

New file: `e2e/boxed-editor/rename.spec.ts` — `test.describe('Boxed Editor / rename')`.

- [x] renames a field no other row references and keeps the model executing
- [x] renames a context that other rows reference, and every dependent expression follows
- [x] renames a nested row that a sibling references, and the sibling's expression follows
- [x] renames a function that another row calls, and the call site follows
- [x] renames a row referenced from a decision table rule, and the rule follows
- [x] renames a row referenced from an optimisation constraint, and the constraint follows
- [x] reports a visible error instead of silently corrupting the model when a rename cannot be migrated
- [x] keeps accepting unrelated edits after any rename
- [x] migrates a row's description across a rename of that row
- [x] migrates a nested row's description across a rename of its ancestor
- [x] migrates test-case cells across a rename
- [x] migrates test-case cells across a drag-move

The dependent-expression tests now run normally because option (2) is implemented. The visible-error cases use a
genuinely invalid colliding rename and still prove atomic non-corruption plus unrelated-edit recovery.

**Result:** option (3) remains the safety baseline and option (2) is now shipped for full editor-side refactoring.
All 12 tests run and pass, including the five formerly fixme'd dependent-reference cases and all four overlay
migration cases.

---

## Definition of done

- [x] Renaming anything either migrates references or fails visibly. Neither silently corrupts the model.
- [x] The decision from 6.1 is recorded, both here and where Resolved Decision #12 lives.
- [x] Overlay migration is proven by a browser test for the first time.
- [x] All 12 browser tests pass (or the fixme'd subset is explicitly justified above); `tsc --noEmit` clean.
- [x] [`current-bugs.md`](current-bugs.md) checkboxes for Bug 10 updated.
