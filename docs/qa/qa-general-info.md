# QA — General Information

The charter for every QA document in `docs/qa/`. Read this before picking up any phase. It has no checkboxes: it is
policy, not work.

| Document                                                   | What it holds                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `qa-general-info.md`                                        | This charter — testing policy, conventions, fixtures, glossary.   |
| [`current-bugs.md`](current-bugs.md)                        | Every confirmed defect, with repro, root cause and fix location.  |
| [`improvement-phase-1.md`](improvement-phase-1.md)          | Browser test foundation — stories, harness, helpers.              |
| [`improvement-phase-2.md`](improvement-phase-2.md)          | Commit pipeline & error visibility.                               |
| [`improvement-phase-3.md`](improvement-phase-3.md)          | Creation affordances — building constructs from nothing.          |
| [`improvement-phase-4.md`](improvement-phase-4.md)          | Column & argument headers — rename, retype, reorder.              |
| [`improvement-phase-5.md`](improvement-phase-5.md)          | Settings pickers & rule authoring forms.                          |
| [`improvement-phase-6.md`](improvement-phase-6.md)          | Rename & reference integrity.                                     |
| [`improvement-phase-7.md`](improvement-phase-7.md)          | Browser coverage — functions.                                     |
| [`improvement-phase-8.md`](improvement-phase-8.md)          | Browser coverage — decision tables.                               |
| [`improvement-phase-9.md`](improvement-phase-9.md)          | Browser coverage — relations, lists & drag-and-drop.              |
| [`improvement-phase-10.md`](improvement-phase-10.md)        | Browser coverage — editing semantics, naming, modes & overlays.   |
| [`improvement-phase-11.md`](improvement-phase-11.md)        | Business-flow capstone — loan origination, built from blank.      |

Each phase is scoped to **one component/area** so an agent picking it up stays inside a small set of files. Phases
declare their prerequisites explicitly; anything not listed as a prerequisite can be worked in parallel.

---

## 1. The testing policy

### 1.1 Playwright is the product's test suite. Everything else is a supplement.

Every behaviour a user can observe is verified in a **real browser, through the real UI, with real user gestures**.
This is not a stylistic preference. Every create-path defect in [`current-bugs.md`](current-bugs.md) — a
`complexType` that cannot be created at all, a hit-policy chip that does nothing, a "(new row)" button that silently
no-ops — was invisible to the existing React unit tests, because those tests drive the service layer directly and
start from models that already contain the construct under test. A unit test can only prove that a function does what
it says; it cannot prove a business analyst can reach that function.

**A behaviour is "covered" only when a Playwright test exercises it the way a person would.** No exceptions, and no
"the unit test already covers it" arguments.

### 1.2 The engine is never mocked

Stories load the real `@edgerules/web` WASM engine, in the browser, through
`createBoxedEditorService(MutableDecisionService.fromCode(...))` — exactly as a host application would. Assertions
that a mutation "worked" mean the real engine parsed it, linked it and executed it.

There are exactly **two** sanctioned exceptions, both because the thing being substituted is a *host*
responsibility this package deliberately does not ship, not part of the engine:

1. **Test-case data.** `edgerules-react` has no Test Case *editor* — `TestsManager` renders cases, but authoring them
   is the host's job. So a story that needs test cases seeds them through `TestCasesService` in its **own setup**,
   before the editor mounts. The seeding lives in the story, never in a spec file; a spec may only read the rendered
   results. Cases seeded this way are real `TestCasesService` records executed by the real `TestRunner` against the
   real engine — only the *authoring gesture* is skipped.
2. **The LP solver.** `optimise` execution calls out to a host-registered solver (`registerSolver`); the engine ships
   the two adapters (`toCplexLp`, `mapHighsSolution`, both exported from `@edgerules/web`) but not the solver itself,
   and `highs` is not currently a dependency of this repo. **The preferred fix is to add `highs` as a devDependency
   and wire the real solver** so optimisation results are genuinely computed — see Phase 1. A canned-solution stub is
   a last resort only, and if it is ever used it must be labelled as such in the story and no test may assert an
   optimisation *value* through it (only that a run completed).

Anything else — parse results, link errors, execution output, CRUD semantics — comes from the real engine or the
test does not count.

### 1.3 What a spec file may and may not do

**Permitted** (this is the whole vocabulary of a business user):
- `page.click`, `page.keyboard`, `page.getByRole`, `page.getByTestId`, `page.getByLabel`, drag gestures.
- Opening the three-dot row menu and choosing an item.
- Clicking the trailing "(new …)" placeholder.
- Typing into a cell's CodeMirror editor and pressing Enter / Escape.
- Reading text that the page renders — including the read-only captions described in §3.

**Forbidden** in any spec file:
- Calling `service.setBoxedRowData` / `service.remove` / `service.rename` / `service.move`, or any
  `MutableDecisionService` method, from the test.
- `page.evaluate` that mutates anything. (Read-only `page.evaluate` is also discouraged — prefer a rendered caption,
  so the assertion goes through the same DOM the user sees.)
- Loading a story that already contains the construct the test is about to create. If a test's subject is "creating
  X", the fixture must not contain an X.
- Asserting only on the DOM for a mutation that should have succeeded. A rolled-back `setWithLinkCheck` write can
  leave the DOM momentarily right — see §3.

### 1.4 Where non-browser tests are still allowed

Vitest is kept for two narrow purposes, and neither counts as coverage of user-facing behaviour:

- **Pure-function tests** for `service/normalize.ts`, `service/denormalize.ts`, `commands/rowFactories.ts`,
  `dnd/dropRules.ts` — data in, data out, no React, no user. Useful for pinning down a tricky transformation once the
  browser test has already proved the behaviour end to end.
- **Engine-contract probes** — a throwaway or committed script that pins an engine behaviour this package depends on
  (the repros in [`current-bugs.md`](current-bugs.md) are all of this kind). When an engine upgrade lands, these are
  what tells you which workarounds to delete.

Existing RTL tests under `src/components/boxed-editor/__tests__/` stay where they are — they are not to be deleted,
but they are also not to be extended for new user-facing behaviour. New behaviour goes to Playwright.

---

## 2. Directory layout and conventions

```
e2e/
  support/
    storybook.ts               # cross-component only: openStory, storyIndex, storyIdsWithPrefix
  boxed-editor/
    helpers.ts                 # component-local shared gestures and assertions
    columnHelpers.ts           # shared column-CRUD gestures for ruleset + relation headers
    rendering.spec.ts          # every story renders
    fields-and-lists.spec.ts   # root/context/complex-type field CRUD, list boundaries, read-only
    functions.spec.ts          # Phase 7
    decision-tables.spec.ts    # Phase 8
    relations.spec.ts          # Phase 9
    edge-cases.spec.ts         # Phase 10
    business-flow.spec.ts      # Phase 11
  decision-table/ code-editor/ code-editor-cell/ project-explorer/ tests-manager/
```

- **One directory per published component**, named exactly like its `src/components/<name>` folder / npm subpath
  export, so the e2e tree mirrors the package's public surface.
- **Split by concern, not one mega-file per component.** Playwright's default `testMatch` only picks up
  `*.spec.ts`/`*.test.ts`, so `helpers.ts` is never mistaken for a test file.
- **`e2e/support/` is for cross-component helpers only.** Component-specific helpers stay local.
- **Group with `test.describe('<Component> / <concern>', …)`** inside every spec file.
- Directory-scoped runs work with no config change: `npx playwright test e2e/boxed-editor`.

### 2.1 Locator conventions

| Thing                          | Locator                                                         | Status                       |
| ------------------------------ | --------------------------------------------------------------- | ---------------------------- |
| A row                           | `page.getByTestId('row-${path}')`                               | exists                       |
| A row's value column            | `…locator('[data-column="value"]')`                             | exists                       |
| A container's append placeholder| `page.getByTestId('append-${path}')`                            | exists                       |
| A row's three-dot menu          | `…getByRole('button', { name: 'Open row actions' })`            | exists                       |
| A name-cell editor              | `page.getByLabel('name ${path}')`                               | exists                       |
| A description cell              | `page.getByLabel('description ${path}')`                        | exists                       |
| An inline commit error          | `role="alert"`                                                  | exists (value cells only)    |
| **A menu/append action error**  | `page.getByTestId('row-error-${path}')`                         | **to add — Phase 2**         |
| **A column/argument header**    | `page.getByTestId('column-${rowPath}-${columnName}')`           | **to add — Phase 4**         |
| **Live execution result**       | `page.getByTestId('live-result')`                               | **to add — Phase 1**         |
| **Live committed model**        | `page.getByTestId('live-model')`                                | **to add — Phase 1**         |

Prefer `data-testid`-scoped locators over text matching wherever one exists, so a rename elsewhere in a long flow
does not break unrelated assertions. Anything marked "to add" is a deliverable of the named phase — do not work
around a missing testid with a text matcher; add the testid.

---

## 3. Proving a mutation actually committed

`createBoxedEditorService`'s `setWithLinkCheck` writes, then link-checks the **whole model**, then rolls the write
back if linking fails. A rolled-back write can leave the DOM looking right for a frame. **Asserting on row text alone
is therefore not proof that anything was saved.**

Every "this should have succeeded" assertion must additionally check one of:

- **`live-result`** — the execution output caption. The strongest proof: the model parsed, linked and ran.
- **`live-model`** — a caption rendering `service.toPortable()`, so structural edits with no visible execution effect
  are still assertable.

Both are rendered by the `ExecutingHarness` story wrapper (Phase 1), are read-only, and update on `onChange`. Because
`execute()` is asynchronous, every assertion against them must be an auto-retrying `expect(locator).toHaveText(…)` /
`toContainText(…)` — never a one-shot `textContent()` read.

Conversely, every "this should have failed" assertion must check both the **visible error** and that the model is
**otherwise unchanged** — never just "no crash".

---

## 4. Fixtures

All fixtures live in `stories/components/boxed-editor/BoxedEditor.stories.tsx` and load through the real engine.
Phase 1 builds them.

| Story                        | Purpose                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `BlankModel`                  | `fromCode('{}')`. The **only** fixture the business-flow spec may load.       |
| `FunctionCrudPlayground`      | One existing multi-arg function, plus room to grow one from zero.            |
| `DecisionTableCrudPlayground` | A ruleset with typed condition columns, both rule forms, and a `best-match` variant. |
| `RelationCrudPlayground`      | A relation with mixed-type columns, 3+ records, one drill-down column.       |
| Existing stories              | `RootModel`, `EditableExpression`, `FocusedContext`, `ReadOnly`, `ColumnsHidden`, `CollectionsListAndRelation`, `FatalError`, `LargeModel`, `TestCasesAndTestRunner`, `FullModel`, `RulesetCrud`, `OptimisationCrud`, `FunctionBodies`. |

**Fixture rule:** a fixture may contain what a test *starts from*, never what a test is *about to create*. If a bug
is a create-path bug, no fixture may paper over it.

Sanity-check every new fixture by executing it once in the story before writing tests against it — a fixture that
does not link makes every downstream assertion meaningless in a way that is very hard to debug from a Playwright
failure.

---

## 5. Engine version and the verification log

Everything marked **verified** in [`current-bugs.md`](current-bugs.md) was reproduced against
`@edgerules/node` / `@edgerules/web` **`0.0.5-alpha.202607291250`** on **2026-07-29**, with throwaway Node scripts —
no React, no mocks.

When the engine is upgraded (`skills/edgerules_wasm_upgrade`):
1. Re-run every repro in `current-bugs.md` first.
2. Any bug that no longer reproduces: mark it fixed-upstream, and **delete** the defensive workaround it justified —
   these workarounds are debt, not features. Each is commented with the engine version it works around.
3. Engine-level defects are also filed in `docs/BUG_REPORTS.md` per this repo's `CLAUDE.md`; keep the two in sync.

---

## 6. Glossary

- **Construct** — a modelling entity the editor renders as one or more rows: context, field, complex type, list,
  relation, function, ruleset, optimisation.
- **Row kind** (`BoxedRowKind`) — one of the 21 row types the editor renders. The business-flow capstone
  (Phase 11) touches all 21.
- **Whole-row commit** — the editor's only write primitive: `setBoxedRowData(path, row)` replaces a row *and its
  children*. Column/argument/cell edits are all expressed as one of these.
- **Link check** — `mutable.link()`, run after every `setBoxedRowData`. Validates the **entire** model, not just the
  written subtree. This is why one broken row can block edits everywhere (see current-bugs Bug 11).
- **Cell-map rule vs boolean-expression rule** — the two ways a decision-table rule's conditions can be authored:
  one cell per condition column, or a single boolean expression.
- **Drill-down cell** — a relation cell holding a complex object; it renders blank in the record row and expands into
  nested rows beneath it.
