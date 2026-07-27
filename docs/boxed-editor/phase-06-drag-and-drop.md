# Boxed Editor — Phase 6: Drag and drop

> Self-contained plan for **Phase 6 of 8** of the `BoxedEditor` React UI implementation.
> Everything needed to implement this phase is in this file. Sibling phases live in `docs/boxed-editor/`.

## 1. Shared context

`BoxedEditor` (`src/components/boxed-editor/`, published as `edgerules-react/boxed-editor`) renders EdgeRules models
as **a single flat treegrid of rows** (Camunda / Trisotech / DMN-influenced, but more compact). The repo has **no
rule-evaluation logic** — execution is delegated to the WASM engine from the sibling `edgerules-v2` repo via
`@edgerules/web` (browser) / `@edgerules/node` (tests); shared types come from `@edgerules/portable`
(`PortableNode`, `PortableError`, `PortableRootContext`).

**Already implemented — do not re-implement:** `BoxedEditorService` + `normalize`/`denormalize`/`rowCache`,
`BoxedRowData` / `BoxedTableRowData`, `TestCasesService`, `TestRunner`, `DocumentationService`.

**Wireframe (authoritative GUI reference):**
`/Users/rimvydasbingelis/Projects/EdgeRules/edgerules-react-frames/src` — `App.tsx`, `boxed/actions.ts`,
`boxed/primitives.tsx`. Screenshot: `docs/screenshots/reference.png`.

**Coding standards (`CLAUDE.md`):** TypeScript + React function components; RTL tests in a component-local
`__tests__/` + a Storybook story; tests use the **real** engine (`@edgerules/node`) — never a mock, only
`fake-indexeddb` and a `registerSolver` stub are substituted; minimal public exports; engine/DSL bugs go to
`docs/BUG_REPORTS.md` instead of React workarounds.

**Prerequisites:** Phases 1–5 — all row kinds render with their handles, menus and commands work.

## 2. Goal of this phase

Make rows sortable and re-parentable, with one pure predicate deciding validity for **both** the drag preview and the
`move()` call, and with the overlay path migration that a move implies.

## 3. Handles

The **function icon, ruleset icon, optimisation icon, type icon, and the 6-dot expression handle** each drag their
whole row **and its children**. A drop maps to `move(fromPath, toParentPath, index)`.

**Non-draggable kinds** — rendered via the `SettingRow` primitive with a **gear icon** instead of a drag handle:
`model`, `function-result`, `ruleset-default`, `ruleset-hit-policy`, `optimisation-variable-group`,
`optimisation-objective`, `optimisation-constraint-group`, `optimisation-setting`.

**Under `readOnly` (Resolved Decision #4):** handles stay **visible** — the icons *are* the handles and the 6-dot
handle is a grouping cue — but drag is **suppressed**: no drag cursor, `dragstart` blocked. Neither hidden nor
greyed.

## 4. `dnd/dropRules.ts` — the single pure predicate

One pure function, shared by the drag preview and the `move()` call, so the two can **never disagree**. Valid
targets (a drop outside these is rejected and the row snaps back):

| Dragged kind                                                                                     | Allowed destination                            |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Any sortable kind                                                                                | Reorder within its own parent — always allowed |
| `field` (as a `complexType` child)                                                               | Only a `complexType`                           |
| `field` (as a context child), `context`, `complexType`, `list`, `relation`, `function`, `ruleset` | Any `context` or the model root                |
| `optimisation`                                                                                   | **Model root only**                            |
| `list-item`                                                                                      | Only a `list` with a **matching element type** |
| `relation-item`                                                                                  | Only a `relation` with **matching columns**    |
| `rule`                                                                                           | Only its own `ruleset`, **reorder only**       |
| `optimisation-variable` / `optimisation-constraint`                                              | Only its own optimisation's matching group     |
| `function-result`, `ruleset-default`, `ruleset-hit-policy`, `optimisation-variable-group`, `optimisation-objective`, `optimisation-constraint-group`, `optimisation-setting` | **Not draggable** |

`optimise` may only be declared at the model root — nested is a link-time error
(`../edgerules-v2/doc/architecture/dsl/OPTIMISATION_METAPHOR_SPEC.md` §3), which is why `optimisation` may only be
dropped there.

## 5. The `move` contract (service side — already implemented)

| Guarantee                    | Detail                                                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `move` is mechanical         | Insert-then-remove. A failed insert leaves the source untouched; a **failed remove after a successful insert leaves a duplicate** and returns the error verbatim — **no rollback**.                                          |
| `index` semantics            | Fully meaningful only for **array-shaped** parents; for context-shaped parents the fixed group sort dominates.                                                                                                              |
| DnD validity is the UI's job | `move` performs the splice only. Structural validity (`rule` → only its own `ruleset`, etc.) is `dnd/dropRules.ts`, built in this phase, and must gate both the drag preview and the `move()` call.                          |
| Errors come back verbatim    | A `PortableError` leaves the cache untouched for that path, so the last-good row stays visible.                                                                                                                              |
| Normalization is done        | After a drop the destination **re-applies the facade's sort order on read-back** — never re-sort in React.                                                                                                                   |

Context elements are re-sorted by the facade as `complexType` → `function` → `ruleset` → `optimisation` → everything
else (`context`/`list`/`relation`/`field`), each group in source order — so a cross-group reorder may visibly settle
into the group order after the drop. That is expected.

## 6. Overlay path migration (Resolved Decision #7)

After **every successful `rename` or `move`**, the command layer calls `renamePath(from, to)` on **both** overlay
services for every path that changed:

```typescript
documentationService.renamePath(from, to);  // free-text descriptions, keyed by fully qualified path
testCasesService.renamePath(from, to);      // test cases + result sets, keyed by subject-relative path
```

The facade stays overlay-agnostic; this is the editor command layer's job. Both calls are no-ops when the
corresponding service prop is absent.

## 7. Path conventions

Paths are the **engine's CRUD paths** — never invent UI-only paths. `"*"` is the model root; context fields use dot
paths (`application.amount`); collection items use indexes (`applicants[0]`); function/ruleset/optimisation bodies
are addressed through their authored field path (`monthly.result`, `risk.rules[2].then.limit`,
`factoryProduction.variables.chairs`). Optimisation child paths are **row identities, not engine CRUD locations** —
the facade merges child edits into the owning whole-node declaration. Authoritative syntax:
`../edgerules-v2/doc/architecture/CRUD_SPEC.md`.

## 8. Files touched

```
src/components/boxed-editor/
├─ dnd/dropRules.ts            — NEW: pure predicate over the §4 matrix
├─ dnd/useRowDrag.ts           — NEW: drag source; suppressed (not hidden) under readOnly
├─ dnd/useRowDrop.ts           — NEW: drop target + preview, gated by dropRules
├─ commands/useRowCommands.ts  — add move() dispatch + overlay renamePath
├─ rows/*Row.tsx               — attach drag/drop to the existing handles
└─ __tests__/dnd.test.tsx      — NEW
```

## 9. Tasks

- [ ] Ensure project compiles and existing tests are passing
- [ ] Add `dnd/dropRules.ts` as a pure predicate over the [drag-and-drop matrix](#4-dnddroprulests--the-single-pure-predicate)
- [ ] Add `dnd/useRowDrag.ts` / `dnd/useRowDrop.ts`; handles stay visible but drag is suppressed under `readOnly`
      (Resolved Decision #4); the same `dropRules` gates both preview and the `move()` call
- [ ] Call `renamePath(from, to)` on `DocumentationService` and `TestCasesService` after every successful
      `rename`/`move`
- [ ] Add `__tests__/dnd.test.tsx`: reorder, reparent, rejected drops, non-draggable kinds, overlay migration
- [ ] Mark all checkboxes as done in this document once verified

## 10. Verification

`__tests__/dnd.test.tsx` (real `MutableDecisionService` from `@edgerules/node`, `fake-indexeddb`, `registerSolver`
stub) covers:

- the full `dropRules` matrix as a table-driven unit test;
- reorder within a parent and reparent into another `context` / the model root;
- rejected drops (e.g. `rule` into a foreign `ruleset`, `optimisation` into a nested context, `list-item` into a
  mismatched `list`) — the row snaps back and no `move()` is issued;
- non-draggable kinds cannot start a drag; `readOnly` suppresses drag while keeping handles visible;
- overlay `renamePath` migration: a description and a test result follow the moved path.
