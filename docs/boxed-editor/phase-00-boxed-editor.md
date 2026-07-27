# Boxed Editor — Phase 0: Prerequisites

> Self-contained plan for **Phase 0 of 8** of the `BoxedEditor` React UI implementation.
> Everything needed to implement this phase is in this file. Sibling phases live in `docs/boxed-editor/`.

## 1. Shared context

`BoxedEditor` (`src/components/boxed-editor/`, published as `edgerules-react/boxed-editor`) is the structured,
visual authoring surface for EdgeRules models: **a single flat treegrid of rows**. Its interaction model is
influenced by the boxed-expression / decision-modeling experiences of **Camunda** and **Trisotech** and by the
**DMN** standard, but it deliberately proposes more compact layouts and ergonomics than standard DMN boxed
expressions.

This repository contains **no rule-evaluation logic** — execution is delegated to the WASM engine from the sibling
`edgerules-v2` repo via `@edgerules/web` (browser) / `@edgerules/node` (tests), with shared TS types from
`@edgerules/portable` (`PortableNode`, `PortableError`, `PortableRootContext`).

### Already implemented — do not re-implement

| Layer                                                        | Location                                | Status                                                              |
| ------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------- |
| `BoxedEditorService` facade, normalize/denormalize, row cache | `src/components/boxed-editor/service/`  | ✅ Done — real-engine tests in `boxed-editor/__tests__/`             |
| `BoxedRowData` / `BoxedTableRowData` / `SignatureParameter`   | `boxed-editor/boxed-editor-types.ts`    | ✅ Done                                                              |
| `TestCasesService`, `useTestCases`, `useTestResult`           | `src/components/test-cases-service/`    | ✅ Done                                                              |
| `TestRunner` (`createTestRunner`), `TestsManager`             | `src/components/tests-manager/`         | ✅ Done — needs exporting (**this phase**)                            |
| `DocumentationService`, `useDescription`                      | `src/components/documentation-service/` | ✅ Done — consumed through its interface only                        |
| **`BoxedEditor` React UI**                                    | `src/components/boxed-editor/`          | ⬜ Phases 0–8                                                        |

The service is the model's only surface; the UI is a pure renderer plus a command layer over it.

### References

| What                          | Where                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GUI wireframe (authoritative) | `/Users/rimvydasbingelis/Projects/EdgeRules/edgerules-react-frames/src` — `App.tsx` (composition/occupancy), `boxed/actions.ts` (row kinds + menus), `boxed/*.tsx` (per-construct rendering), `hooks/useAltHeld.ts` (type reveal) |
| Reference screenshot          | `docs/screenshots/reference.png`                                                                                                                                                                                                 |
| Test data contract            | `docs/specs/TESTS_MANAGER_SPEC.md` — owns `TestCasesService`, `TestRunner`, `TestCase`, `TestResultSet`                                                                                                                          |
| Descriptions overlay          | `docs/DOCUMENTATION_SERVICE_STORY.md`                                                                                                                                                                                            |
| Engine CRUD / DSL             | `../edgerules-v2/doc/architecture/CRUD_SPEC.md`, `.../dsl/RULESET_METAPHOR_SPEC.md`, `.../dsl/OPTIMISATION_METAPHOR_SPEC.md`, `../edgerules-v2/doc/reference/RULESETS_REFERENCE.md`, `.../OPTIMISE_REFERENCE.md`                  |

### Coding standards (from `CLAUDE.md`)

- TypeScript + React function components only.
- New components ship `*.test.tsx` / `*.test.ts` (RTL) in a component-local `__tests__/` folder **plus** a Storybook story.
- Tests run against the **real** engine (`@edgerules/node`) — never a mock. Only the environment is substituted:
  `fake-indexeddb` for `indexedDB`, and a `registerSolver` stub for the LP solver EdgeRules does not ship.
- Keep exported props/types minimal — they become the npm public API.
- If a mutation or normalization exposes a WASM/DSL bug, append a reproducible entry to `docs/BUG_REPORTS.md`
  rather than compensating in React.

## 2. Goal of this phase

Put the plumbing in place that later phases depend on: make the runner/path helpers importable by a host, and land
the **public prop types** of the component so every later phase codes against a fixed API.

No rendering work happens here.

## 3. Component API (land it in this phase)

The package entry point is `edgerules-react/boxed-editor`.

```ts
interface BoxedEditorProps {
  // --- model ---
  service: BoxedEditorService;        // The mutable model authority (createBoxedEditorService(mutable)). Never a second persisted model.
  path: string;                       // The authored CRUD path to show. `"*"` for the whole model.
  revision?: string | number;         // Host-controlled invalidation token; on change the editor calls service.invalidate().
  readOnly?: boolean;                 // Disables name/value editing and ordering; navigation and visible handles remain.
  onChange?: (snapshot: PortableRootContext) => void;  // Once per successful committed mutation.
  onOpenNode?: (target: BoxedEditorOpenTarget) => void; // Routes specialized nodes to another host editor.

  // --- editing ---
  languageService?: CodeEditorService; // Diagnostics + completions for the one active expression cell.

  // --- overlays (host-constructed, passed in — same convention as TestsManager) ---
  documentationService?: DocumentationService; // DescriptionColumn. Empty + read-only when omitted.
  testCasesService?: TestCasesService;         // TestResultsColumn. Column hidden when omitted.
  testRunner?: TestRunner;                     // Recomputes the selected case after each commit.
  testSubjectId?: TestSubjectId;               // Subject whose results are shown; defaults to `'*'`.
  autoRunTests?: boolean;                      // Whether a commit / case switch re-runs automatically. Defaults to true.

  // --- chrome ---
  showHeader?: boolean;        // Model header row. Default true.
  showTestResults?: boolean;   // TestResultsColumn. Default true.
  showDescription?: boolean;   // DescriptionColumn. Default true.
  showType?: boolean;          // Type tooltip (hover + Alt-reveal). Default true.
  expanded?: boolean;          // Initial global expand state. Default true.
  className?: string;
  sx?: SxProps<Theme>;
}
```

```ts
type BoxedEditorTargetKind =
  | 'type-definition'
  | 'ruleset'
  | 'loop'
  | 'boxed-editor'
  | 'code-editor';

interface BoxedEditorOpenTarget {
  path: string;
  kind: BoxedEditorTargetKind;
}
```

**Notes:**

- `type-definition`, `ruleset`, `loop` route to their specialized host editors (Types / Decision Table / Loop).
  `boxed-editor` asks the host to open the target context in its own nested `BoxedEditor`. `code-editor` backs the
  `View as code` action — offered on `model`, `function`, `ruleset`, and `optimisation` rows; the target carries just
  the `path`, and resolving it into code text or a rendered editor is entirely the host's job. `ruleset` is the one
  target kind whose node is *also* fully editable inline. `optimise` is edited exclusively inline and carries no
  `BoxedEditorTargetKind` entry.
- `expanded` sets the **initial** global expand state only. After first render each collapsible row keeps its own
  state, toggled by its own Expand/Collapse action. Changing `revision` does not reset per-row expand state.

### Export surface

`edgerules-react/boxed-editor` exports `BoxedEditor`, `BoxedEditorProps`, `BoxedEditorOpenTarget`,
`BoxedEditorTargetKind`, plus the already-exported `createBoxedEditorService`, `BoxedEditorService`, `BoxedRowData`,
`BoxedRowKind`, `BoxedTableRowData`, `SignatureParameter`.

`DocumentationService`, `TestCasesService`, and `TestRunner` are **not** re-exported: a host imports them from
`edgerules-react/documentation-service`, `edgerules-react/test-cases-service`, and `edgerules-react/tests-manager`
and passes instances in as props, exactly as `TestsManager` does. Rows, cells, primitives, hooks, contexts, and
normalization internals are **not** public API.

## 4. Why `qualifyPath` moves (Resolved Decision #17)

`TestResultSet.results` is keyed by **subject-relative** paths, while `BoxedEditor` rows carry **fully qualified**
paths. A test-result cell must therefore convert with `qualifyPath(subjectId, path)` before looking a result up.
Since `test-cases-service` owns subject-relative paths, `qualifyPath` belongs there; `tests-manager` keeps a
re-export so existing importers do not break. This also resolves `docs/specs/TESTS_MANAGER_SPEC.md` Open Question #1
— mark it resolved there.

`createTestRunner(mutable, testCasesService, subject, { modelRevision })` must be exported from
`src/components/tests-manager/index.ts` because the **host** — not `BoxedEditor` — constructs the runner and passes
it in as the `testRunner` prop (Resolved Decision #19: `BoxedEditor` triggers runs but never executes, so it keeps
zero engine dependency).

## 5. Files touched

```
src/components/boxed-editor/
├─ index.ts             — (exists) add BoxedEditor + props exports
└─ BoxedEditorProps.ts  — NEW: BoxedEditorProps, BoxedEditorOpenTarget, BoxedEditorTargetKind (public)

src/components/tests-manager/index.ts     — export createTestRunner; re-export qualifyPath
src/components/test-cases-service/        — qualifyPath moves here
docs/specs/TESTS_MANAGER_SPEC.md          — Open Question #1 → resolved
```

## 6. Tasks

- [ ] Ensure project compiles and existing tests are passing
- [ ] Export `createTestRunner` from `src/components/tests-manager/index.ts` so a host can construct the runner
      `BoxedEditor` needs
- [ ] Move `qualifyPath` into `src/components/test-cases-service/` (it owns subject-relative paths), re-export it from
      `tests-manager` for compatibility, and update `specs/TESTS_MANAGER_SPEC.md` Open Question #1 as resolved
      (Resolved Decision #17)
- [ ] Add `BoxedEditorProps.ts` with the [Component API](#3-component-api-land-it-in-this-phase) props and the
      `BoxedEditorOpenTarget` / `BoxedEditorTargetKind` types; export them from `boxed-editor/index.ts`
- [ ] Mark all checkboxes as done in this document once verified

## 7. Done when

- `npm run typecheck` and the existing test suite pass.
- A host can `import { createTestRunner } from 'edgerules-react/tests-manager'` and
  `import { qualifyPath } from 'edgerules-react/test-cases-service'`.
- `BoxedEditorProps`, `BoxedEditorOpenTarget`, `BoxedEditorTargetKind` are exported and type-check against the
  signatures above (the `BoxedEditor` component itself is added in Phase 1).
