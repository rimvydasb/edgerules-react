# Boxed Editor — Bug Reports & E2E Coverage Plan

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done.

This document has three parts:

1. **Confirmed bugs** — root-caused against the actual source (`src/components/boxed-editor/**`) and, where noted,
   verified with a throwaway reproduction against the real engine (`@edgerules/node`, never mocked, per project
   policy). Each entry has concrete repro steps, a root cause, a suggested fix location, and the regression test that
   must exist once it's fixed.
2. **E2E coverage plan** — the previous suite (originally a flat `e2e/boxed-editor.spec.ts` + `e2e/decision-
   table.spec.ts`, now reorganized per §2.1a below) only smoke-tested a few golden paths and did not exercise CRUD
   depth, column/argument maintenance, or failure recovery. This section is the actionable backlog for an industry-
   grade suite: full CRUD matrices for functions and decision tables, plus one long, realistic "business analyst"
   workflow that deliberately hits parse/link/execution failures and proves the editor recovers.
3. **File & test-name tracking checklist** — every concrete file this plan requires creating or modifying, and every
   Playwright test name to be written, as one flat checklist to track completion against.

---

## Part 1 — Confirmed bugs

### Bug 1 — Untyped function/optimisation argument corrupts on round-trip, blocking every argument added after the first

**Severity: Critical.** This is the root cause behind both `Strange null error` and `Impossible to create more than
one function argument` from the original report — they are the same defect observed at two different moments.

- [ ] Filed in `docs/BUG_REPORTS.md` (engine-level entry, see below)
- [ ] Workaround shipped in edgerules-react
- [ ] Regression test added (unit, real engine) and e2e test added

**Root cause (confirmed via isolated `@edgerules/node` repro, no React involved):**

`EDGERULES_API_SPEC.md`/`API_SPEC.md` §"Function Definition" documents `@parameters` values as one of a bare type
string, a `PortableTypedValue`, or **`null` for an untyped (unannotated) parameter**. `rowFactories.addArgument` and
`denormalize.ts`'s `parameters()` both follow that contract correctly — a fresh, untyped function argument is written
as JS `null`.

But the installed engine (`@edgerules/node`/`@edgerules/web` `0.0.5-alpha.202607291250`) does not round-trip that
`null` faithfully: after `mutable.set('f', {..., '@parameters': {arg: null}, ...})`, the very next `mutable.toPortable()`
returns `'@parameters': {arg: 'null'}` — the **string** `"null"`, not JSON `null`. Minimal isolated repro:

```ts
const mutable = MutableDecisionService.fromCode('{ func f(): "" }');
mutable.set('f', {
  '@kind': 'function',
  '@parameters': { arg: null },
  '@body': { '@kind': 'expression', expression: '""' },
});
mutable.toPortable().f['@parameters']; // { arg: 'null' }  — should be { arg: null }
```

`normalize.ts`'s `parametersOf` reads that back as `{ name: 'arg', type: 'null' }` (a truthy string, so it takes the
"has a type" branch). The row now genuinely believes `arg` is typed `"null"`. The next whole-row commit — e.g. a
second `Add argument` click — round-trips that row back through `denormalize.ts`'s `parameters()`, whose `else if
(parameter.required === undefined) result[name] = parameter.type` branch writes the string `"null"` back out as a
**real type-name reference** (not a JSON null anymore). The engine's linker then rejects it:

```
execution error: linker error: E102: unknown type 'null' in node NodeId(…) — not a built-in type
and no visible 'type null: …' definition
```

`createBoxedEditorService`'s `setWithLinkCheck` catches that failure and rolls the write back to the *previous*
(already-corrupted, single-argument) state, and `useRowActions`'s `add-argument` handler discards the returned
`PortableError` — no cell is open to show it inline (unlike a value-cell edit). Net effect from the user's chair:
click "Add argument" a second time and **nothing visibly happens** — matching the original report exactly. The E102
error only becomes visible later, whenever *any other* edit on that same function happens to re-trigger a whole-row
commit and its link check (e.g. editing the `result` expression) — which is why the original repro ("try setting
string as return type") looked unrelated to arguments at all: the error is a symptom of the earlier corrupted
argument, not of whatever cell was being edited when it surfaced.

**Suggested fix (edgerules-react side, defensive — does not require an engine upgrade):**

Treat the string `"null"` as equivalent to JSON `null` (i.e., "untyped") on both sides of the boundary, so the
corruption never compounds into a bad type reference:

- `normalize.ts` → `parametersOf`: `if (parameter === null || parameter === 'null') return { name };`
- `denormalize.ts` → `parameters()`: guard the same way before the `else if (parameter.required === undefined)`
  branch, so a parameter whose `type` is exactly `'null'` still denormalizes to JSON `null`, not a type reference.

**Also file upstream:** append `docs/BUG_REPORTS.md` with the engine-level defect (untyped `@parameters` value does
not round-trip through `set()`/`toPortable()`), quoting the isolated repro above and the `API_SPEC.md` contract it
violates, per this repo's `CLAUDE.md` bug-reporting instructions.

**Regression tests to add once fixed:**
- Unit (`__tests__/commands.test.tsx`): brand-new function (`Add function`), `Add argument` **twice in a row**,
  assert two distinctly-named untyped parameters and that the model still links.
- Unit: same for `optimisation` (its "Add argument" path shares `addArgument`, just with a forced type — confirm the
  untyped-function path specifically, since that's the one that hits `null`).
- E2E: the "long flow" scenario in Part 2 must include this exact sequence.

---

### Bug 2 — No way to rename a function argument or a decision-table column after creation

**Severity: High.**

- [ ] Confirmed root cause
- [ ] Fix designed (rename affordance) and implemented
- [ ] Regression test added

**Root cause (confirmed by inspection, not an engine issue — purely missing UI):** `ArgumentHeaders.tsx` (function
arguments) and `RulesetRow.tsx`'s `RulesetColumnHeaders` (condition/action columns) and `RelationRow.tsx`'s
`RelationColumnHeaders` all render each column name through `TypeName`, which is a **read-only** label with a
hover/Alt tooltip (`primitives/TypeName.tsx`) — no click handler, no text field, nothing editable. `useRowActions.ts`'s
menu items for `function`/`ruleset`/`relation` only offer `Add argument`/`Add condition column`/`Add action
column`/`Add column` and `Delete "<name>" …` — there is no `rename-argument`/`rename-column` action id in
`menu/actions.ts`'s `rowActionRegistry` at all. The only way to rename a column today is delete-and-recreate, which
loses every rule/record cell already authored against it.

**Suggested fix:** add a `rename-column`/`rename-argument` row action (or make the header name itself clickable like
`NameCell` does for ordinary rows) that renames in place: for a `function`/`optimisation` argument, rewrite
`parameters[i].name` and every reference to the old name in the body/rules; for a `ruleset` condition/action column,
rewrite `parameters`/`actionColumns` and the corresponding key in every `rule`/`ruleset-default`'s `when`/`then`; for
a `relation` column, rewrite `columns` and every record's cell key.

---

### Bug 3 — No way to change a column/argument's type after creation

**Severity: High.**

- [ ] Confirmed root cause
- [ ] Fix designed and implemented
- [ ] Regression test added

**Root cause:** same as Bug 2 — `TypeName` is read-only. `addConditionColumn` hardcodes the new column's type to
`'string'` (`rowFactories.ts`); there is no subsequent way to change it. A function argument's type can currently only
be set indirectly and only once — there is no menu action or inline control to edit `parameters[i].type` after the
argument exists.

**Suggested fix:** pair with Bug 2's rename UI — an editable header (name + type) rather than static text, or a
dedicated "Edit type" menu action per argument/column, writing through the existing whole-row `setBoxedRowData` path.

---

### Bug 4 — Column/argument drag handles are decorative, not functional

**Severity: Medium.**

- [ ] Confirmed root cause
- [ ] Fix designed and implemented (or feature explicitly descoped and UI removed)
- [ ] Regression test added

**Root cause:** `primitives/ColumnDragHandle.tsx` renders a `DragIndicatorIcon` with `cursor: 'grab'` styling and
**no** `draggable`, `onMouseDown`, or `@dnd-kit` wiring whatsoever. Compare with row-level reordering, which *is* fully
wired (`dnd/useRowDrag.ts`, `dnd/useRowDrop.ts`, `dnd/dropRules.ts`, consumed by `BoxedEditorGrid`'s `DndContext`) —
column reorder has no equivalent hook at all. Every place `ColumnDragHandle` is used (`ArgumentHeaders`,
`RulesetRow`'s condition/action headers, `RelationRow`'s column headers) is affected identically. Today it is pure
visual false-affordance: it invites a drag that does nothing.

**Suggested fix:** either wire real column-level drag-and-drop (reorder `parameters`/`actionColumns`/`columns` and
rewrite every dependent row's cell order to match, mirroring `move()`'s row-level "whole-parent rewrite" pattern), or
remove the misleading handle and ship an explicit "Move left"/"Move right" menu action instead if drag is out of
scope for now.

---

### Bug 5 — Errors from container-level "Add …" / "Delete …" actions are swallowed

**Severity: High** — this is what makes Bug 1 look like "nothing happens" instead of a visible, actionable error, and
is worth fixing independently of Bug 1 (any future whole-row commit that fails will have the same silent-failure
symptom).

- [ ] Confirmed root cause
- [ ] Fix designed and implemented
- [ ] Regression test added

**Root cause:** every `onSelect` handler built in `useRowActions.ts` calls `commands.setBoxedRowData(...)` (or
`commands.remove(...)`) and **discards the returned `PortableError`** — e.g. `add-argument`: `commands.setBoxedRowData(
row.path, addArgument(table))` with no assignment, no check, no surfaced feedback. Contrast with `ExpressionCell`'s
value-cell commit path, which keeps the returned error and renders it inline (`role="alert"`, per
`e2e/boxed-editor/fields-and-lists.spec.ts`'s existing "reports invalid values" test). A user driving the three-dot menu currently has
**no way to learn a menu action failed** — the row silently doesn't change, with no toast, no alert, nothing in the
DOM to assert against either.

**Suggested fix:** surface the `PortableError` from every mutating menu action the same way a value-cell commit does
— a shared toast/alert channel keyed by the acting row's path, so `RowActionsMenu`-driven mutations get the same
visibility guarantee as `ExpressionCell`-driven ones.

---

### Bug 6 — Needs a fresh, deliberate repro: "cannot create anything, even after the underlying error is fixed"

**Severity: Unknown pending repro — treat as Critical until disproved**, since it describes the editor becoming
unusable model-wide, not scoped to one row.

- [ ] Reproduced with a minimal, written-down repro script
- [ ] Root-caused
- [ ] Fixed
- [ ] Regression test added

The original report's wording ("you cannot add anything even error is fixed") implies some **global**, not
row-scoped, latch — e.g. a stale `rowCache` entry, a `readOnly`/error boundary flag that never resets, or a
`useRowActions` memo that stops recomputing after the first rejected commit. Nothing in `BoxedEditor.tsx` shows an
obvious global latch (the only blanket `<Alert>` is the "path does not exist" case used by the `FatalError` story),
so this needs a dedicated repro rather than more static reading. Concretely:
1. Trigger *any* rejected commit (Bug 1's second `Add argument` is a ready-made one, or any value-cell edit that
   fails linking).
2. Immediately try an unrelated, independent mutation elsewhere in the model — `Add relation` on the model root,
   `Add field` on an unrelated context, etc.
3. If that unrelated mutation also silently fails (or the row tree stops re-rendering entirely), this is a real,
   distinct, higher-severity bug from Bug 1/Bug 5 and needs its own root-cause dig into `rowCache.invalidate`/
   `useSyncExternalStore` interaction after an error path. If it succeeds, downgrade this entry to "no longer
   reproducible post-Bug-1-fix" and close it with a note.

This scenario must be the *first* checkpoint of the long business-flow e2e test in Part 2 — it is exactly the kind of
thing a short, isolated unit test won't catch, but a long, stateful flow will.

---

## Part 2 — E2E coverage plan (industry-grade)

### 2.0 Why the current suite is insufficient

The original `e2e/boxed-editor.spec.ts` (223 lines, now split per §2.1a) covered: story rendering, root-level field
CRUD, one invalid/cancel/recovery sequence on a single scalar field, and list append with boundary values. It never
touched `function`, `ruleset`, or `optimisation` rows at all — the very row kinds every confirmed bug above lives in.
`e2e/decision-table/decision-table.spec.ts` exercises the **separate, standalone** `DecisionTableEditor` component
(`src/components/decision-table/`), not the `ruleset`/`rule` rows rendered *inside* `BoxedEditor`
(`RulesetRow.tsx`/`RuleRow.tsx`) — so today there is **zero** e2e coverage of decision-table editing as it actually
appears inside the Boxed Editor. Nothing exercises: multi-argument functions, argument/column rename or type change,
column reorder, rule-matrix maintenance (add/duplicate/delete rule, add/delete condition or action column), ruleset
execution with varied inputs, or recovery from a
rejected whole-row commit (Bugs 1/5/6 above all live in this gap).

### 2.1a E2E directory organization — done

The old `e2e/` was a flat list of one-spec-per-component files (`boxed-editor.spec.ts`, `code-editor.spec.ts`,
`code-editor-cell.spec.ts`, `decision-table.spec.ts`, `project-explorer.spec.ts`, `tests-manager.spec.ts`), each
hand-building `page.goto('/iframe.html?id=…&viewMode=story')` calls independently. Adding four more boxed-editor
specs (2.2–2.5) on top of that would have made boxed-editor dominate a directory shared with five unrelated
components. Reorganized as:

```
e2e/
  support/
    storybook.ts          # openStory(page, id), storyIndex(page), storyIdsWithPrefix(page, prefix)
  boxed-editor/
    helpers.ts             # openBoxedEditorStory, valueCell, commitExpression, renameRow, replaceActiveExpression,
                            # appendListItem, addList, chooseRowAction — extracted from the old flat spec
    rendering.spec.ts      # the "every story renders" smoke test
    fields-and-lists.spec.ts   # root/context/complex-type field CRUD + list boundary values + read-only
    functions.spec.ts          # NEW — §2.2
    decision-tables.spec.ts    # NEW — §2.3
    relations.spec.ts          # NEW — §2.4
    business-flow.spec.ts      # NEW — §2.5
  decision-table/
    decision-table.spec.ts
  code-editor/
    code-editor.spec.ts
  code-editor-cell/
    code-editor-cell.spec.ts
  project-explorer/
    project-explorer.spec.ts
  tests-manager/
    tests-manager.spec.ts
```

Conventions this establishes (apply to any future e2e addition, boxed-editor or otherwise):

- **One directory per published component**, named exactly like its `src/components/<name>` folder / npm subpath
  export, so the e2e tree mirrors the package's public surface.
- **Split by concern, not one mega-file per component** — a component directory holds as many `*.spec.ts` files as it
  has distinct concerns (boxed-editor: rendering / fields-and-lists / functions / decision-tables / relations /
  business-flow). A `helpers.ts` alongside them holds component-local shared setup; Playwright's default `testMatch`
  only picks up `*.spec.ts`/`*.test.ts`, so a `helpers.ts` is never mistaken for a test file and needs no config
  change.
- **`e2e/support/` is for cross-component helpers only** (today: the generic Storybook `openStory`/`storyIndex`
  navigation used by every component). Component-specific helpers stay local to that component's directory, never
  promoted to `support/` just because a second file in the same component wants them too.
- **Group with `test.describe('<Component> / <concern>', ...)`** inside every spec file, so reporter output groups
  sensibly regardless of directory/file layout (`rendering.spec.ts`/`fields-and-lists.spec.ts` already follow this;
  apply the same to every new file in §2.2–2.5).
- Directory-scoped runs already work with zero `playwright.config.ts` changes — e.g. `npx playwright test
  e2e/boxed-editor`. Adding per-directory Playwright `projects` (for tagging/parallel CI shards) is a reasonable
  future enhancement but not required by this plan.

- [x] Move each existing single-file component spec into its own directory (`decision-table/`, `code-editor/`,
      `code-editor-cell/`, `project-explorer/`, `tests-manager/`).
- [x] Extract `e2e/support/storybook.ts` (`openStory`, `storyIndex`, `storyIdsWithPrefix`) and switch every moved spec
      to use it instead of a hand-built `page.goto('/iframe.html?id=…')` call.
- [x] Split the old flat `e2e/boxed-editor.spec.ts` into `e2e/boxed-editor/rendering.spec.ts` +
      `e2e/boxed-editor/fields-and-lists.spec.ts`, extracting shared helpers into `e2e/boxed-editor/helpers.ts`.
- [x] Verify `npx playwright test --list` still discovers all 28 pre-existing tests post-reorg, and `tsc --noEmit`
      stays clean.

### 2.1 Fixtures to add (Storybook stories, real engine, no mocks)

All new stories load through `createBoxedEditorService(MutableDecisionService.fromCode(...))` exactly like the
existing ones in `stories/components/boxed-editor/BoxedEditor.stories.tsx` — reuse `FunctionBodies`/`RulesetCrud` as
starting points, don't fork the harness pattern.

- [ ] `FunctionCrudPlayground` — a model with **one existing multi-arg function** (so tests can both mutate an
      existing signature and grow a brand-new one from zero), a `live-result` caption calling the function with
      fixed inputs so execution correctness is visible on screen the same way `EditableHarness`'s `live-payment` is.
- [ ] `DecisionTableCrudPlayground` — a `ruleset` with both rule-condition forms (cell-map and boolean-expression, cf.
      `RulesetCrud`) *plus* a `live-result` caption invoking it, so column/rule edits are checked against real
      execution output, not just DOM text.
- [ ] `RelationCrudPlayground` — a `relation` with 3+ columns, 3+ records, and at least one column holding a
      complex/drill-down value, to cover column CRUD on the *other* table-shaped construct.
- [ ] `BlankModel` — `MutableDecisionService.fromCode('{}')` (or the minimal equivalent), no other setup. This is the
      **only** fixture 2.5's business-flow spec is allowed to load — see 2.5.0: that spec must construct everything
      itself via `Add …` actions, not start from an already-populated model like the three playgrounds above.

### 2.2 Function CRUD matrix (new e2e spec: `e2e/boxed-editor/functions.spec.ts`)

- [ ] Create a function from scratch (`Add function` on model root and inside a nested `context`), verify default
      shape (blank synthesized `result`, zero arguments).
- [ ] Add arguments **one at a time up to 5**, asserting after *each* click that the previous arguments are still
      present and distinctly named (this is the exact shape that catches Bug 1 — a test that only adds one argument,
      like the current unit test, cannot).
- [ ] Rename each of the 5 arguments (once Bug 2 is fixed) and confirm the body/result expression referencing them by
      old name is flagged or auto-migrated per whatever behavior is chosen.
- [ ] Reorder arguments (once Bug 4 is resolved either via real drag or a "Move" action) and confirm call-site
      positional argument order still matches.
- [ ] Change each argument's type (once Bug 3 is fixed) across the full type matrix: `number`, `string`, `boolean`,
      `date`, a `type X: {...}` complex type, and an array type (`T[]`).
- [ ] Delete an argument that the body *doesn't* reference (must succeed) and one that it *does* reference (must be
      rejected with a visible error, never a silent no-op — this is Bug 5's regression test in miniature).
- [ ] Convert an inline single-expression function body into a multi-statement body and back; verify the synthesized
      `result` row behaves per `FunctionResultRow`'s documented constraint (never independently addressable while
      inline).
- [ ] Nested function inside a `context` (`group.nested`, per the existing `FunctionBodies` story) — repeat the
      add-argument-twice and rename checks at non-root depth, since several of the confirmed bugs are path-math bugs
      that could behave differently once nested.
- [ ] Duplicate a function, confirm auto-renaming (`fn` → `fn2`) and that argument/body edits on the duplicate never
      affect the original.
- [ ] Execute the function end-to-end after every structural edit above via the story's `live-result` caption — a
      structural edit that "looks right" in the DOM but breaks linking must fail the test.

### 2.3 Decision table (ruleset) CRUD matrix (new e2e spec: `e2e/boxed-editor/decision-tables.spec.ts`)

- [ ] Create a decision table from scratch (`Add decision table`), verify the seeded `hitPolicy`/empty `default` per
      `nextRulesetRow`.
- [ ] Add condition columns and action columns up to 4 each; verify every existing rule's cell count grows in lock-
      step (this is the ruleset analogue of the function-argument test above, and should be written the same way —
      add repeatedly, assert cumulative state each time, not just the end state).
- [ ] Rename a condition column and an action column (once Bug 2 is fixed); confirm every rule's `when`/`then` key
      migrates together, not just the header.
- [ ] Change a condition column's type (once Bug 3 is fixed): numeric range (`18..25`), comparison (`>= 65`),
      equality, and a string/enum column.
- [ ] Reorder columns (once Bug 4 is resolved) and confirm rule cells reorder with the header, not independently.
- [ ] Add a rule, duplicate a rule, delete a rule, and reorder rules by drag (this path *is* wired — it's row-level,
      not column-level — so this part of the matrix can be written today without waiting on any fix above).
- [ ] Switch a rule between the two authoring forms — cell-map (`{age: 18..25, income: <30000}`) and boolean-
      expression (`age >= 65`) — and back; verify the correct `RuleRow` sub-UI renders each time
      (`conditionsExpression` vs per-column cells, per `RuleRow.tsx`).
- [ ] Edit the pinned `default` row's action cells; confirm it can't be deleted (`deletable: false`) and isn't
      offered a `Duplicate`.
- [ ] Switch `hitPolicy` to `best-match` and confirm the `priority` column appears across every rule row and the
      header (`RulesetRow`'s `showPriority`), then switch back and confirm it disappears cleanly.
- [ ] Execute the table with inputs that hit: the first rule, a later rule, no rule (falls through to `default`), and
      — under `best-match` — a genuine priority tie, via the story's `live-result` caption.

### 2.4 Relation (table-shaped collection) CRUD matrix (new e2e spec: `e2e/boxed-editor/relations.spec.ts`)

- [ ] Add/rename/retype/reorder/delete columns (same four operations as 2.3, on `relation` rather than `ruleset`) —
      write this as a small shared helper module so the same assertions run against both `relation` and `ruleset`
      column headers without duplicating the whole spec.
- [ ] Add/duplicate/delete records; verify a newly-added record's cells default per `appendRelationItem`'s
      column-alignment rule.
- [ ] Drill down into a record whose cell holds a complex object (per `RelationItemRow`'s `drillDownNames` logic) and
      edit a nested field there.

### 2.5 The long business-workflow flow (new e2e spec: `e2e/boxed-editor/business-flow.spec.ts`)

One long, single `test()` (or a `test.step`-segmented sequence sharing one page/model, deliberately **not** reset
between steps) simulating a rules analyst building a real model **from a completely blank starting point, using only
the editor's own "Add …" affordances** — never a pre-baked `MutableDecisionService.fromCode('{ ... a lot ... }')`
fixture. That distinction matters: every other spec in this plan (2.2–2.4) is free to load an existing playground
story and mutate it, but this one exists specifically to prove the *construction* path end-to-end, in narrative
order, with state carried forward — which is exactly the condition under which Bugs 1, 5, and 6 actually occur. A
suite of short, independent tests structurally cannot catch that class of regression.

#### 2.5.0 The scenario: "Loan Origination & Portfolio Decisioning"

A single coherent story, not a kitchen-sink dump of unrelated constructs: a lender's rules analyst models (1) intake
of a loan application and its applicant/collateral data, (2) the calculations underwriting depends on, (3) a risk-
tiering decision table, and (4) a portfolio-level capital-allocation optimisation that decides how many loans of each
risk tier the bank originates this quarter. Every entity added below is motivated by that story — nothing is added
just to tick a box — and together they touch **every one of the 21 `BoxedRowKind`s** the editor supports, so this one
flow doubles as the full-entity-type regression suite:

| `BoxedRowKind`                    | Where it's introduced in the scenario                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `model`                             | Implicit root of the blank starting model.                                       |
| `context`                           | `application` — the intake record (Step 1).                                      |
| `field`                             | `application.applicationDate`/`loanAmount`/`propertyValue`, plus one typed placeholder field (Step 1). |
| `complexType`                       | `type Applicant: { name, age, income }`, reused as a field's type (Step 1).       |
| `list`                              | `requiredDocuments` — scalar string list (Step 2).                               |
| `list-item`                         | Individual document entries in `requiredDocuments` (Step 2).                      |
| `relation`                          | `collateralProperties` — one record per pledged property (Step 3).               |
| `relation-item`                     | Individual property records, at least one with a drill-down (complex-cell) column (Step 3). |
| `function`                          | `monthlyPayment` (inline), `affordabilityScore` (multi-statement), `originationFee` (no-arg), `application.loanToValue` (nested) (Step 4). |
| `function-result`                   | Synthesized `result` row of each inline function above (Step 4).                 |
| `ruleset`                           | `riskTier` decision table (Step 5).                                              |
| `rule`                              | `riskTier`'s individual rules — both cell-map and boolean-expression forms (Step 5). |
| `ruleset-default`                   | `riskTier`'s pinned fallback row (Step 5).                                       |
| `ruleset-hit-policy`                | `riskTier`'s hit-policy chip, exercised via a `first-match` → `best-match` switch (Step 5). |
| `optimisation`                      | `portfolioMix` — this quarter's capital allocation (Step 6).                     |
| `optimisation-setting`              | `portfolioMix`'s `using`/`bottlenecks`/`timeLimit` settings (Step 6).            |
| `optimisation-variable-group`/`-variable` | One loan-count variable per risk tier from `riskTier` (Step 6).            |
| `optimisation-objective`            | Maximise expected portfolio yield (Step 6).                                     |
| `optimisation-constraint-group`/`-constraint` | Capital-adequacy and per-tier exposure limits (Step 6).                |

- [ ] **Step 1 — applicant & application intake.** From a blank model: `Add field` × 3 directly on the model root
      first (to prove root-level field creation before any container exists), then convert the working set into a
      proper `context` named `application` (`Convert to context`, or `Add field` inside a freshly-added context —
      pick whichever the current UI actually supports and note if neither reads naturally, that's itself a finding)
      holding `applicationDate` (date), `loanAmount` (number), `propertyValue` (number). Separately, add a
      `complexType` named `Applicant` with `name`/`age`/`income` fields, then reference it as a typed field
      (`application.applicant: <Applicant, required: true>`).
- [ ] **Step 2 — required documents.** `Add list` (`requiredDocuments`) at the model root; append 3+ string items via
      the trailing "(new item)" placeholder.
- [ ] **Step 3 — collateral properties.** `Add relation` (`collateralProperties`); add its columns one at a time
      (`address`, `value`, `propertyType`), then add 2+ records; make one record's `address` a drill-down complex
      cell rather than a flat string, to exercise `RelationItemRow`'s drill-down path.
- [ ] **Step 4 — calculations, first failure.** Add the inline function `monthlyPayment`. Add its first argument
      (`loanAmount`). **Deliberately add a second argument immediately** (Bug 1's exact trigger) and assert on the
      *fixed* behavior: two distinct arguments present, model still links, no silent no-op. Then add
      `affordabilityScore` as a multi-statement function (2+ body fields), `originationFee` with zero arguments, and
      a `loanToValue` function nested inside the `application` context.
- [ ] **Step 5 — recovery checkpoint (Bug 6's scenario).** Immediately after Step 4's deliberate failure, perform an
      entirely unrelated mutation — `Add relation` on the model root, distinct from `collateralProperties` — and
      assert it succeeds. This is the single most important assertion in the whole file: it directly tests "cannot
      create anything, even after the error is fixed."
- [ ] **Step 6 — deliberate parse failure and recovery.** Open `monthlyPayment`'s result expression, commit a
      syntactically invalid body (e.g. `application.loanAmount /`), assert the inline error appears, assert every
      *other* row is still interactive (click into an unrelated field, cancel with Escape, confirm no residual edit
      state), then commit a valid expression and confirm the error clears.
- [ ] **Step 7 — deliberate link failure and recovery.** Delete a `monthlyPayment` argument that the body *does*
      reference; assert the rejection is visible (post-Bug-5-fix) and the signature is unchanged; then delete an
      argument that genuinely is unused and confirm that one succeeds.
- [ ] **Step 8 — risk-tiering decision table.** `Add decision table` (`riskTier`), parametrized on
      `application.applicant.age`/`income`/`loanAmount`. Build out 3+ rules and 2+ condition/action columns
      **incrementally**, asserting cumulative state after each add (per the 2.3 matrix's style) — one rule authored
      as a cell-map condition, another as a boolean-expression condition. Switch `hitPolicy` to `best-match` and
      confirm the `priority` column appears everywhere it should, then switch back.
- [ ] **Step 9 — portfolio capital allocation.** `Add optimisation` (`portfolioMix`) at the model root — **root only**,
      per `nextOptimisationRow`'s own doc comment. Add one `optimisation-variable` per `riskTier` output tier (loan
      count to originate this quarter), set the `maximise` objective to expected yield across those variables, and
      add capital/exposure `optimisation-constraint`s referencing both the variables and a value pulled from
      `application`/`riskTier` — this is the cross-construct reference: `riskTier`'s output shapes the constraint a
      structure built in Step 8 imposes on Step 9. Verify `Add Variable`'s seeded companion constraint (`E339`
      avoidance, per `addOptimisationVariable`'s doc comment) never leaves a variable unreferenced.
- [ ] **Step 10 — rename under load.** Rename the `application` context (touching every downstream reference built in
      Steps 1, 4, 8, 9); assert every dependent row's displayed expression/column follows the rename and the model
      still links and executes (this exercises `useRowCommands.rename`'s overlay-migration path end-to-end, which no
      current e2e test touches at all).
- [ ] **Step 11 — bulk maintenance pass.** In one continuous sequence: reorder two `riskTier` rules by drag,
      duplicate a rule, delete the duplicate, add a fourth condition column, delete a different existing column,
      rename yet another — i.e. the "various renames, cell value changes, column type changes, column reorders" the
      original report asked for, but chained back-to-back rather than in isolation, since that chaining is what the
      original bugs actually needed to surface.
- [ ] **Step 12 — read-only handoff.** Re-render the same underlying service in `readOnly` mode (simulating handing
      the finished model to a reviewer) and confirm no mutation control survives the switch, matching the existing
      `read-only story` test's intent but against the now fully-built, non-trivial model rather than a fresh one.
- [ ] **Step 13 — final execution audit.** Run the model end-to-end with 3+ distinct applicant/application input sets
      chosen to hit different branches of `riskTier` (first-rule match, later-rule match, default fallback) and
      confirm `portfolioMix` re-optimises consistently against each, asserting the live-result output for every run.

### 2.6 Test-writing standards for all of the above

- [ ] Every new e2e test drives the **real** `@edgerules/web` engine via a Storybook story (per project policy,
      `[[Test with real engine]]`) — no network/engine mocking.
- [ ] Every "add N times" test asserts **after each addition**, not just at the end (this is the difference that
      would have caught Bug 1 immediately instead of needing a dedicated root-cause investigation).
- [ ] Every mutation test that *should* fail asserts the visible error (`role="alert"` or its post-Bug-5-fix
      equivalent) **and** that the model/DOM is otherwise unchanged — never just "no crash."
- [ ] Reuse the existing helpers in `e2e/boxed-editor/helpers.ts` (`valueCell`, `commitExpression`, `renameRow`,
      `replaceActiveExpression`, `chooseRowAction`) rather than reinventing them; extend that module — and
      `e2e/support/storybook.ts` for anything cross-component — rather than duplicating helpers into each new spec
      file.
- [ ] Prefer `data-testid`-scoped locators over text matching wherever the existing convention already provides one
      (`row-${path}`, `append-${path}`), so renames elsewhere in a long flow don't break unrelated assertions.

---

## Part 3 — File & test-name tracking checklist

One flat list to check off against, so progress is trackable at a glance without re-reading Parts 1–2. "Test name" is
the literal Playwright `test('…')` (or `test.step('…')`) title to write — keep the wording when you write the test
unless a step turns up a reason to change it, and if you do rename one, update its box here in the same commit so
this list never drifts from the suite it's tracking.

### 3.1 Files to create or modify

`[x]` = done this session · `[ ]` = still to do. Every path below is the exact file the next agent should touch —
nothing more, nothing invented. Siblings not relevant to this plan are omitted from the tree (not deleted, just not
shown).

```
edgerules-react/
├── docs/
│   ├── boxed-editor/
│   │   └── bug-reports.md                      [x] this document
│   └── BUG_REPORTS.md                          [ ] append the untyped-parameter round-trip defect (Bug 1)
├── stories/
│   └── components/
│       └── boxed-editor/
│           └── BoxedEditor.stories.tsx          [ ] add FunctionCrudPlayground, DecisionTableCrudPlayground,
│                                                    RelationCrudPlayground, BlankModel (§2.1)
├── src/
│   └── components/
│       └── boxed-editor/
│           ├── service/
│           │   ├── normalize.ts                 [ ] parametersOf: treat string 'null' as untyped (Bug 1)
│           │   └── denormalize.ts                [ ] parameters(): same guard before re-emitting a type ref (Bug 1)
│           ├── menu/
│           │   └── actions.ts                   [ ] add rename-argument/rename-column action ids (Bug 2)
│           ├── hooks/
│           │   └── useRowActions.ts             [ ] wire rename (Bug 2) + edit-type (Bug 3) actions; stop
│           │                                        discarding PortableError on every mutating action (Bug 5)
│           ├── primitives/
│           │   ├── TypeName.tsx                 [ ] make header name/type editable in place (Bugs 2, 3)
│           │   └── ColumnDragHandle.tsx          [ ] wire real column drag, or replace with Move actions (Bug 4)
│           └── __tests__/
│               ├── commands.test.tsx            [ ] +2 tests — see §3.2 "Unit tests"
│               └── normalization.test.ts        [ ] +1 test — see §3.2 "Unit tests"
└── e2e/
    ├── support/
    │   └── storybook.ts                         [x] openStory, storyIndex, storyIdsWithPrefix
    ├── boxed-editor/
    │   ├── helpers.ts                           [x] extracted from the old flat spec
    │   ├── rendering.spec.ts                    [x] split from the old flat spec — §3.2 has its 1 test
    │   ├── fields-and-lists.spec.ts             [x] split from the old flat spec — §3.2 has its 4 tests
    │   ├── functions.spec.ts                    [ ] new — §3.2 "functions.spec.ts" (14 tests)
    │   ├── decision-tables.spec.ts              [ ] new — §3.2 "decision-tables.spec.ts" (13 tests)
    │   ├── relations.spec.ts                    [ ] new — §3.2 "relations.spec.ts" (8 tests)
    │   └── business-flow.spec.ts                [ ] new — §3.2 "business-flow.spec.ts" (1 test, 13 steps)
    ├── decision-table/
    │   └── decision-table.spec.ts               [x] moved + updated to use openStory
    ├── code-editor/
    │   └── code-editor.spec.ts                  [x] moved + updated to use openStory
    ├── code-editor-cell/
    │   └── code-editor-cell.spec.ts             [x] moved + updated to use openStory
    ├── project-explorer/
    │   └── project-explorer.spec.ts             [x] moved + updated to use openStory
    └── tests-manager/
        └── tests-manager.spec.ts                [x] moved + updated to use openStory
```

### 3.2 Playwright test names to create

#### `e2e/boxed-editor/functions.spec.ts` — `test.describe('Boxed Editor / functions')`

- [ ] creates a function from scratch at the model root with a blank result and no arguments
- [ ] creates a function from scratch inside a nested context
- [ ] adds five arguments one at a time, keeping every previously added argument distinct and present
- [ ] adds two arguments in a row to a brand-new function and keeps both distinct (Bug 1 regression)
- [ ] adds two arguments in a row to a nested function and keeps both distinct (Bug 1 regression, non-root depth)
- [ ] renames each of five arguments and migrates references in the body (Bug 2 regression)
- [ ] renames a nested function's argument and migrates references in the body (Bug 2 regression, non-root depth)
- [ ] reorders arguments and keeps positional call-site order in sync (Bug 4 regression)
- [ ] changes an argument's type across number, string, boolean, date, a complex type, and an array type (Bug 3
      regression)
- [ ] deletes an argument the body does not reference
- [ ] rejects deleting an argument the body does reference, with a visible error and an unchanged signature (Bug 5
      regression)
- [ ] converts an inline single-expression body into a multi-statement body and back
- [ ] duplicates a function with auto-renaming and independent argument/body edits
- [ ] executes the function correctly after every structural edit in this file

#### `e2e/boxed-editor/decision-tables.spec.ts` — `test.describe('Boxed Editor / decision tables')`

- [ ] creates a decision table from scratch with the seeded hit policy and empty default row
- [ ] adds condition columns one at a time, growing every existing rule's cells in lock-step
- [ ] adds action columns one at a time, growing every existing rule's cells in lock-step
- [ ] renames a condition column and migrates every rule's `when` key together with the header (Bug 2 regression)
- [ ] renames an action column and migrates every rule's `then` key together with the header (Bug 2 regression)
- [ ] changes a condition column's type across a numeric range, a comparison, an equality, and a string/enum column
      (Bug 3 regression)
- [ ] reorders columns and keeps rule cells aligned with the reordered header (Bug 4 regression)
- [ ] adds, duplicates, and deletes a rule
- [ ] reorders rules by drag
- [ ] switches a rule from cell-map form to boolean-expression form and back
- [ ] edits the pinned default row's actions and confirms it cannot be deleted or duplicated
- [ ] switches hit policy to best-match, shows the priority column everywhere, and switches back cleanly
- [ ] executes the table against inputs that hit the first rule, a later rule, the default fallback, and a priority
      tie under best-match

#### `e2e/boxed-editor/relations.spec.ts` — `test.describe('Boxed Editor / relations')`

- [ ] adds columns one at a time, growing every existing record's cells in lock-step
- [ ] renames a column and migrates every record's cell key together with the header (Bug 2 regression)
- [ ] deletes a column and confirms every record's cell for that column is removed with it
- [ ] re-authors a column's cell values across the type matrix (number → string → boolean) and confirms the engine's
      homogeneous-array constraint is enforced consistently across every record (relations have no header-level
      "type" control to test against, unlike function arguments/ruleset columns — see Bug 3's scope note)
- [ ] reorders columns and keeps record cells aligned with the reordered header (Bug 4 regression)
- [ ] adds, duplicates, and deletes a record
- [ ] appends a record and confirms its cells default per the column-alignment rule
- [ ] drills down into a record's complex-object cell and edits a nested field there

#### `e2e/boxed-editor/business-flow.spec.ts` — `test.describe('Boxed Editor / business flow')`

- [ ] builds a loan origination and portfolio decisioning model from a blank start, surviving parse/link/argument
      failures along the way (one long test; each bullet below is that test's `test.step`)
  - [ ] Step 1 — applicant & application intake
  - [ ] Step 2 — required documents list
  - [ ] Step 3 — collateral properties relation
  - [ ] Step 4 — calculations, first failure (duplicate-argument regression)
  - [ ] Step 5 — recovery checkpoint: an unrelated `Add relation` still succeeds (Bug 6 regression)
  - [ ] Step 6 — deliberate parse failure and recovery
  - [ ] Step 7 — deliberate link failure and recovery
  - [ ] Step 8 — risk-tiering decision table
  - [ ] Step 9 — portfolio capital allocation optimisation
  - [ ] Step 10 — rename under load
  - [ ] Step 11 — bulk maintenance pass
  - [ ] Step 12 — read-only handoff
  - [ ] Step 13 — final execution audit

#### Unit tests (vitest, real `@edgerules/node` engine, no mocks)

**`src/components/boxed-editor/__tests__/commands.test.tsx`:**

- [ ] Add Argument appends two distinct, uniquely-named untyped parameters when clicked twice in a row on a
      brand-new function (Bug 1 regression)
- [ ] Add Argument appends two distinct, uniquely-named untyped parameters when clicked twice in a row on a function
      nested inside a context (Bug 1 regression, non-root depth)

**`src/components/boxed-editor/__tests__/normalization.test.ts`:**

- [ ] a parameter whose portable value round-trips as the string `'null'` normalizes to an untyped parameter, not a
      type reference (Bug 1 regression)

#### Existing files — no new test names, tracked here only so this checklist is complete

- [x] `e2e/boxed-editor/rendering.spec.ts` — every current Boxed Editor story renders from the Storybook index
- [x] `e2e/boxed-editor/fields-and-lists.spec.ts` — 4 tests (creates/completes fields; reports invalid values; creates
      a list; read-only story)
