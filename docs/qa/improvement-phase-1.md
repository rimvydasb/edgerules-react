# Phase 1 — Browser test foundation

**Area:** `stories/components/boxed-editor/BoxedEditor.stories.tsx`, `e2e/boxed-editor/helpers.ts`,
`e2e/support/storybook.ts`, `package.json`. **No product code changes.**

**Goal:** make it possible to prove, from a browser test, that a mutation really committed — that the real engine
parsed, linked and executed it. Nothing else in `docs/qa/` can be trusted until this exists.

**Prerequisites:** none. This phase blocks every other phase.

Read [`qa-general-info.md`](qa-general-info.md) first — especially §1.2 (the engine is never mocked) and §3 (proving a
mutation actually committed).

---

## Why this phase exists

The current story harness (`EditableHarness`) renders a caption labelled `live-payment` that looks like an execution
result but is not — it reads a committed row's **source text**
(`service.getBoxedRowData('payment')?.value`). **No story in this repo executes the model.** Every existing
assertion therefore proves only that the DOM changed, which a rolled-back `setWithLinkCheck` write can also produce.
That is exactly how the create-path bugs in [`current-bugs.md`](current-bugs.md) survived a 28-test suite.

---

## Tasks

### 1.1 The execution harness

- [ ] Add `ExecutingHarness` to `BoxedEditor.stories.tsx` — a wrapper rendering `BoxedEditor` plus two read-only
      captions.
- [ ] `data-testid="live-result"` — the output of `mutable.execute(method, input)`, re-run on every `onChange`,
      keyed by a revision counter (mirror `TestCasesAndTestRunnerHarness`'s existing `revision` pattern).
- [ ] **Render failures too.** A structural edit that breaks linking must show as a failed run, not a stale previous
      value — otherwise every assertion against this caption is vacuous. Render the error text, prefixed so tests can
      distinguish it (e.g. `error: …`).
- [ ] `data-testid="live-model"` — `JSON.stringify(service.toPortable())`, so structural edits with no execution
      effect are still assertable.
- [ ] `data-testid="boxed-change-count"` — keep the existing counter; it is the only way to assert "`onChange` fired
      exactly once per **successful** commit, never on a rejected one".
- [ ] Note in a code comment that `execute()` is **async** (`Promise<unknown>`), so every test asserting on
      `live-result` must use an auto-retrying `expect(locator).toHaveText(…)`, never a one-shot read.

### 1.2 The solver (needed for any `optimise` story)

`optimise` execution calls out to a host-registered solver. `requiresSolver()` is `true` and `execute` refuses to run
without one. `@edgerules/web` exports the two adapters (`toCplexLp`, `mapHighsSolution`, plus the `SolverHandler`
type); it does not ship the solver. `highs` is **not** currently a dependency of this repo.

- [ ] Add `highs` as a **devDependency** and wire a real solver handler in the story:
      `toCplexLp(problem)` → `highs.solve(text, options)` → `mapHighsSolution(...)`. Mirror
      `../edgerules-v2/tests/wasm/optimise.test.ts`'s `highsSolver()` — it is the reference implementation.
- [ ] Verify it runs in the browser (highs-js is Emscripten-based; confirm the Storybook build serves its wasm asset).
- [ ] Only if the real solver cannot be made to work in the browser: fall back to a canned-solution stub, label it
      loudly in the story, and record here that **no test may assert an optimisation value through it** — only that a
      run completed. Do not take this path silently.

### 1.3 Fixtures

Every fixture loads the real engine through `createBoxedEditorService(MutableDecisionService.fromCode(...))`. **A
fixture may contain what a test starts from, never what a test is about to create.**

- [ ] `BlankModel` — `fromCode('{}')` (or the minimal equivalent), wrapped in `ExecutingHarness`. The **only** fixture
      [Phase 11](improvement-phase-11.md) may load.
- [ ] `FunctionCrudPlayground` — one existing multi-arg function (so tests can mutate an existing signature) and room
      to grow a new one from zero, with fixed inputs so execution correctness is visible after every structural edit.
- [ ] `DecisionTableCrudPlayground` — a ruleset with **typed** condition columns (`number`/`string`/`date` —
      unreachable through the UI while [Bug 13](current-bugs.md#bug-13--new-condition-columns-are-hardcoded-string) is
      open, so the fixture must supply them), both rule-condition forms (cell-map and boolean-expression, cf.
      `RulesetCrud`), and a `best-match` variant so the priority column is reachable while
      [Bug 8](current-bugs.md#bug-8--dropdownchip-settings-are-decorative-hit-policy-and-solver-settings-cannot-be-changed)
      is open.
- [ ] `RelationCrudPlayground` — a relation with 3+ **mixed-type** columns (string, number, and a complex/drill-down
      column) and 3+ records, so [Bug 12](current-bugs.md#bug-12--appending-a-record-to-a-relation-with-any-non-string-column-silently-does-nothing)
      is reproducible from a story.
- [ ] Wire `documentationService` into at least one fixture so description-overlay tests
      ([Phase 10](improvement-phase-10.md)) have somewhere to run. This is a real service in this package
      (`src/components/documentation-service`), not a mock.
- [ ] Execute every new fixture once in the Storybook UI before writing any test against it. A fixture that does not
      link makes every downstream assertion meaningless in a way that is very hard to debug from a Playwright failure.

### 1.4 Shared helpers

Extend `e2e/boxed-editor/helpers.ts` — do not duplicate these into spec files.

- [ ] `expectLiveResult(page, expected)` — auto-retrying assertion on `live-result`.
- [ ] `expectLiveModel(page, matcher)` — auto-retrying assertion on `live-model`.
- [ ] `expectRowError(page, path, text)` — asserts `row-error-${path}` (the channel
      [Phase 2](improvement-phase-2.md) adds). Ship it now returning a clear "not implemented yet" failure so Phase 2
      only has to make it pass.
- [ ] `expectNoRowError(page, path)` — the negative form, for "this should have succeeded" assertions.
- [ ] `columnHeaders(page, rowPath)` — reads the ordered column names of a `function`/`ruleset`/`relation` header.
      Text-based for now; switch to the `column-${rowPath}-${columnName}` testid when
      [Phase 4](improvement-phase-4.md) adds it.
- [ ] `dragRow(page, fromPath, toPath)` — a reusable `@dnd-kit`-compatible drag gesture (mouse down, move in steps,
      up). `@dnd-kit` ignores instantaneous moves, so this needs intermediate steps; get it right once here.
- [ ] Create `e2e/boxed-editor/columnHelpers.ts` as an empty, documented module — [Phase 9](improvement-phase-9.md)
      fills it with the shared ruleset/relation column assertions.

### 1.5 Foundation smoke spec

Add to `e2e/boxed-editor/rendering.spec.ts` (no new file needed):

- [ ] `test('executes the model and shows a live result')` — open `BlankModel`, add one field through the UI, and
      assert `live-result` and `live-model` both update. This is the test that proves the harness itself works; if it
      is red, every other phase's results are meaningless.
- [ ] `test('shows an execution failure instead of a stale result')` — commit something that breaks linking and assert
      `live-result` shows the error, not the previous value.
- [ ] `test('solves an optimisation end to end')` — open `OptimisationCrud` through `ExecutingHarness` and assert a
      real solver result. Skip only if 1.2 fell back to a stub.

---

## Definition of done

- [ ] `ExecutingHarness` renders `live-result`, `live-model` and `boxed-change-count`, and shows execution errors.
- [ ] All four new fixtures exist, link, and execute.
- [ ] `highs` is wired (or the fallback is documented here with its restriction).
- [ ] Every helper in 1.4 exists and is exported.
- [ ] The three smoke tests in 1.5 pass.
- [ ] `npx playwright test e2e/boxed-editor` is green and `tsc --noEmit` is clean.
