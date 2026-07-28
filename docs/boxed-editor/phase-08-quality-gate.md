# Boxed Editor — Phase 8: Quality gate

> Self-contained plan for **Phase 8 of 8** of the `BoxedEditor` React UI implementation.
> Everything needed to implement this phase is in this file. Sibling phases live in `docs/boxed-editor/`.

## 1. Shared context

`BoxedEditor` (`src/components/boxed-editor/`, published as `edgerules-react/boxed-editor`) renders EdgeRules models
as **a single flat treegrid of rows** (Camunda / Trisotech / DMN-influenced, but more compact). The repo has **no
rule-evaluation logic** — execution is delegated to the WASM engine from the sibling `edgerules-v2` repo via
`@edgerules/web` (browser) / `@edgerules/node` (tests).

**Wireframe (authoritative GUI reference):**
`/Users/rimvydasbingelis/Projects/EdgeRules/edgerules-react-frames/src` — `App.tsx` (composition/occupancy),
`boxed/actions.ts` (row kinds + menus), `boxed/*.tsx` (per-construct rendering), `hooks/useAltHeld.ts`.
Screenshot: `docs/screenshots/reference.png`.

**Coding standards (`CLAUDE.md`):** TypeScript + React function components; RTL tests in a component-local
`__tests__/` **plus a Storybook story per component**; tests use the **real** engine (`@edgerules/node`) — never a
mock, only `fake-indexeddb` for `indexedDB` and a `registerSolver` stub for the LP solver EdgeRules does not ship;
keep exported props/types minimal — they become the npm public API.

**Prerequisites:** Phases 0–7 complete.

## 2. Goal of this phase

Close the story: stories, docs, lint/typecheck, engine bug reports, and a first-principles review of the whole
implementation against the specification below.

## 3. Storybook stories to add

1. **Full model** (every row kind) with a `DocumentationService` overlay.
2. **`TestCasesService` + `TestRunner` wired**: live re-run on edit, previous/next navigation, stale and error
   states. The story must memoize `createTestRunner(mutable, testCasesService, subject, { modelRevision })` on
   `[mutable, testCasesService, subject, revision]` and bump `revision` from `onChange` — otherwise results are never
   marked stale and navigation stops re-running.
3. **A `ruleset`-bearing model**: inline rule CRUD, `ruleset-hit-policy`, `ruleset-default`.
4. **An `optimisation`-bearing model**: inline variable/objective/constraint CRUD, `optimisation-setting`,
   `optimisation-variable-group`.
5. **A `func`-bearing model**: inline and multi-statement function bodies, a no-argument function, nested functions.

## 4. Test suite that must be green

| Test file                    | Covers                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BoxedEditor.test.tsx`       | rendering at root and focused paths, fatal vs. path-scoped errors, `readOnly`, column visibility props                                                                                             |
| `row-kinds.test.tsx`         | one case per `BoxedRowKind` (21), including the full `ruleset` and `optimisation` families                                                                                                         |
| `commands.test.tsx`          | every menu action, placeholders, special actions, auto-rename on Duplicate, one `onChange` per commit                                                                                              |
| `alt-reveal.test.tsx`        | hover vs. Alt-held type tooltip behavior                                                                                                                                                           |
| `dnd.test.tsx`               | `dropRules` matrix, reorder + reparent, non-draggable kinds, overlay `renamePath` migration                                                                                                        |
| `test-results.test.tsx`      | auto-run after commit (debounced/coalesced), previous/next re-run only when absent or stale, pending and stale rendering, run-level error, subject-relative `qualifyPath` lookup, formatting table |
| existing service `__tests__` | unchanged — normalization, mutation, move                                                                                                                                                         |

If a mutation or normalization exposes a WASM/DSL bug, append a reproducible entry to `docs/BUG_REPORTS.md` rather
than compensating in React.

## 5. Review checklist — invariants the implementation must satisfy

- **Row vocabulary:** all 21 `BoxedRowKind`s render; `field` is the single generic leaf (class field, typed input,
  plain expression) with one shared action list.
- **Grid:** 40×40 px minimum cell; rows grow only in 40 px steps (tall rows — `model`, `function`, `ruleset`,
  `optimisation` — are 80 px); cells grow horizontally only in 40 px steps; text vertically centred; no pixel
  offsets.
- **Columns:** `NameColumn`, `ValueColumn`, `DescriptionColumn`, `TestResultsColumn`, `ActionsColumn`, gated by
  `showDescription` / `showTestResults` / `showHeader` / `showType`.
- **Single source of truth:** no copy of the row tree in React state; rows come from `useSyncExternalStore` over the
  facade; rows render **in the order the service returns** — never re-sorted in React.
- **Cell text is opaque:** DSL text in, DSL text out, verbatim; the view never parses DSL.
- **Whole-node writes:** container edits rewrite the whole parent; `optimise` is a root-only whole-definition CRUD
  surface whose child paths are row identities, not CRUD locations.
- **Errors:** fatal (bad `path` → alert replaces the grid), path-scoped (`PortableError` → inline, focus kept,
  last-good row visible), deferred (no rollback), run-level (header chip, empty cells).
- **Overlays:** descriptions and test results are separate path-keyed stores, never folded into `BoxedRowData`;
  `renamePath` is called on both after every successful `rename`/`move`.
- **Export surface:** `edgerules-react/boxed-editor` exports `BoxedEditor`, `BoxedEditorProps`,
  `BoxedEditorOpenTarget`, `BoxedEditorTargetKind`, plus the pre-existing `createBoxedEditorService`,
  `BoxedEditorService`, `BoxedRowData`, `BoxedRowKind`, `BoxedTableRowData`, `SignatureParameter`.
  `DocumentationService`, `TestCasesService`, `TestRunner` are **not** re-exported; rows, cells, primitives, hooks,
  contexts, and normalization internals are **not** public API.
- **`readOnly`:** mutating menu actions hidden (only `Duplicate` and view toggles remain); cells not editable; drag
  suppressed but handles still visible.

## 6. Out of scope (confirm nothing crept in)

- `BoxedEditorService`, `normalize`/`denormalize`, `rowCache` — **already implemented**; touch only if a UI need
  exposed a real gap, and record any such change.
- `DocumentationService`'s own implementation — `docs/DOCUMENTATION_SERVICE_STORY.md`.
- `TestCasesService`, `TestRunner`, `TestsManager` — `docs/specs/TESTS_MANAGER_SPEC.md`.
- Flow Editor, Types Editor, Loop Editor — reached only via `onOpenNode`.
- Paging / virtualization for large bodies (Resolved Decision #11 → follow-up story).
- Repo-wide `ARCHITECTURE.md` (none exists in this checkout).

## 7. Resolved decisions (context for the review)

| #   | Decision                                         | Resolution                                                                                                                                                                                                       |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Enrichment-service wiring                        | Descriptions and test results are separate path-keyed overlays consumed via hooks, never folded into the facade or `BoxedRowData`; instances passed as props, matching `TestsManager`.                            |
| 2   | `BoxedEditorService` layering                    | The facade is constructed with a `MutableDecisionService` and delegates internally; the component only ever sees `BoxedEditorService`. **Implemented.**                                                           |
| 3   | `BoxedRowData` flat vs. union                    | Flat optional-field interface (`BoxedTableRowData` for tabular kinds); renderers read only the fields their `kind` uses. **Implemented.**                                                                         |
| 4   | `readOnly` and drag handles                      | Handles stay visible; drag suppressed (no drag cursor, `dragstart` blocked). Neither hidden nor greyed.                                                                                                           |
| 5   | Result / value formatting                        | Services supply raw engine values (`TestResult.value: unknown`); `BoxedEditor` owns all display formatting.                                                                                                       |
| 6   | React binding model                              | `useSyncExternalStore` + facade cache over an immutable-snapshot reducer. **Cache implemented.**                                                                                                                  |
| 7   | Overlay migration on move                        | Both overlays expose `renamePath(from, to)`; the command layer calls it after a successful `rename`/`move`. The facade stays overlay-agnostic.                                                                    |
| 8   | Copy/Paste vs. Duplicate                         | One-click `Duplicate` only, no clipboard pair. Named rows auto-rename on Duplicate.                                                                                                                              |
| 9   | Type disclosure                                  | Types as tooltips on their owning name/header cell, on hover or — for the whole tree at once — while **Alt** is held; `showType` gates it.                                                                        |
| 10  | Descriptions storage                             | IndexedDB overlay via `DocumentationService`; `@description` metadata left untouched.                                                                                                                            |
| 11  | Large-collection strategy                        | Eager load for `getBoxedRowsData` — no paging/virtualization this iteration (follow-up story).                                                                                                                    |
| 12  | Linked-validation failures                       | No rollback. `set`/`rename`/`remove` succeed even when they break a reference elsewhere; the broken reference surfaces as an ordinary path-scoped error where next read. Rollback-on-write would make renaming a referenced field impossible. |
| 13  | Ruleset inline editing vs. `DecisionTableEditor` | Both coexist: full inline decision-table CRUD here, and the standalone editor via `onOpenNode({kind: 'ruleset'})`.                                                                                                |
| 14  | Expand/Collapse                                  | A context-menu toggle (MUI expand/collapse icon) on `function`, `context`, `complexType`, `ruleset`, `optimisation`.                                                                                              |
| 15  | `View as code`                                   | A per-knowledge-element context-menu action on `model`, `function`, `ruleset`, `optimisation`, emitting `onOpenNode({kind: 'code-editor'})`; the code text is the host's concern.                                 |
| 16  | `@node` / `@node-name` annotations               | Ignored by `BoxedEditorService`. A future Flow Editor gets its own normalized view; `BoxedEditor` builds no UI on annotations.                                                                                    |
| 17  | `qualifyPath` ownership                          | Lives in `edgerules-react/test-cases-service`, re-exported from `tests-manager` (Phase 0).                                                                                                                        |
| 18  | Non-deduplicating facade factory                 | `createBoxedEditorService(mutable)` returns a fresh facade per call; a host sharing one cache constructs it once, a second GUI calls `invalidate()`.                                                              |
| 19  | Who triggers test execution                      | `BoxedEditor` triggers runs but never executes: the **host** constructs `TestRunner` and passes it in; `BoxedEditor` calls `run(testCaseId)` per the triggers table.                                              |
| 20  | `ruleset` Duplicate; `optimisation` arguments    | `Duplicate` is offered on `ruleset` with the same auto-rename rule; `optimisation` gets `Add Argument` / `Delete "‹argument›" Argument` matching `function`.                                                      |
| 21  | Debounce window for auto-run                     | Kept at a fixed, internal 300 ms — not exposed as a prop. No host has asked for a different window, and `readOnly`/`showType`/etc. are the only tuning knobs the public API carries; adding `autoRunDelayMs` ahead of a real need would grow the surface for a hypothetical. Revisit if a host profiles a large model and asks. |
| 22  | Non-selected cases after a model change           | Kept as-is: only the selected case re-runs on commit, others go stale until navigated to (already implemented, exercised by the `TestCasesAndTestRunner` story). A commit-time `runAll()` below a case-count threshold would add a second execution path and a magic threshold for a cost (N executions per edit) no host has reported; not worth it pre-emptively. |
| 23  | `View as code` under `readOnly`                   | Kept hidden (not marked `nonMutating` in `useRowActions.ts`), found during the Phase 8 invariant audit. §5's "only Duplicate and view toggles remain" reads as Expand/Collapse (literal toggles); `View as code` is a one-shot navigation action, not a toggle, so excluding it from the readOnly allow-list matches the spec's literal wording even though it is itself non-mutating. Revisit if a read-only host specifically wants code-view access. |

## 8. Open questions — resolved (see Resolved decisions #21–22)

1. ~~**Debounce window for auto-run.**~~ Resolved: kept fixed at 300 ms, internal — see #21.
2. ~~**Non-selected cases after a model change.**~~ Resolved: kept the current selected-only re-run — see #22.

## 9. Follow-up stories to record (not implemented here)

- [ ] Paging / virtualization for large `list` / `relation` / `ruleset` bodies (`getBoxedRowsData(path, {offset,
      limit})` plus virtualized `RelationItemRow` / `RuleRow`) — Resolved Decision #11.
- [ ] Flow Editor cache coherence: if a ReactFlow editor gets its own facade over the same `MutableDecisionService`,
      decide whether `createBoxedEditorService` should deduplicate by engine identity — Resolved Decision #18.

## 10. Tasks

- [x] Ensure project compiles and existing tests are passing
- [x] Add the five [Storybook stories](#3-storybook-stories-to-add)
- [x] Resolve or record architect decisions for the remaining [Open Questions](#8-open-questions-to-resolve-or-record)
- [x] Update `docs/BUG_REPORTS.md` with any engine gaps found during Phases 1–7
- [x] Update `README.md`'s component list and this document's checkboxes
- [x] Perform linting and formatting (`npm run format`, `npm run typecheck`)
- [x] Review the implementation against this document and the wireframe
- [x] Mark all checkboxes as done in this document once verified
