# Boxed Editor — Bug Reports & E2E Coverage Plan

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done.

This document has four parts:

1. **Confirmed bugs** — root-caused against the actual source (`src/components/boxed-editor/**`) and, where noted,
   verified with a throwaway reproduction against the real engine (`@edgerules/node`, never mocked, per project
   policy). Each entry has concrete repro steps, a root cause, a suggested fix location, and the regression test that
   must exist once it's fixed.
2. **E2E coverage plan** — the previous suite (originally a flat `e2e/boxed-editor.spec.ts` + `e2e/decision-
   table.spec.ts`, now reorganized per §2.1a below) only smoke-tested a few golden paths and did not exercise CRUD
   depth, column/argument maintenance, or failure recovery. This section is the actionable backlog for an industry-
   grade suite: full CRUD matrices for functions, decision tables and relations, a cross-cutting edge-case matrix, and
   one long, realistic "business analyst" workflow that builds a complete loan-origination model from a blank start
   and deliberately hits parse/link/execution failures along the way.
3. **Blocking-dependency map** — which parts of Part 2 can be written *today* and which are gated on a Part 1 fix, so
   the suite can be landed incrementally instead of stalling behind the bug backlog.
4. **File & test-name tracking checklist** — every concrete file this plan requires creating or modifying, and every
   Playwright test name to be written, as one flat checklist to track completion against.

### Verification log

Everything marked **verified** below was re-run against the installed engine
(`@edgerules/node`/`@edgerules/web` **`0.0.5-alpha.202607291250`**) on **2026-07-29** with throwaway Node scripts, no
React and no mocks. Anything marked **by inspection** was root-caused from the source only. If the engine is upgraded
(`skills/edgerules_wasm_upgrade`), re-run the verified repros first — several fixes below are defensive workarounds
that should be *removed*, not kept, once the engine round-trips correctly.

---

## Part 1 — Confirmed bugs

| #  | Title                                                                     | Severity | Layer   | Blocks                     |
| -- | ------------------------------------------------------------------------- | -------- | ------- | -------------------------- |
| 1  | Untyped argument corrupts on round-trip                                   | Critical | engine  | §2.2, Step 4               |
| 2  | No rename for an argument / column                                        | High     | react   | §2.2, §2.3, §2.4, Step 11  |
| 3  | No way to change a column/argument type                                   | High     | react   | §2.2, §2.3, Step 8         |
| 4  | Column drag handles are decorative                                        | Medium   | react   | §2.2, §2.3, §2.4, Step 11  |
| 5  | Errors from menu-driven Add/Delete are swallowed                          | High     | react   | every "must fail visibly"  |
| 6  | "Cannot create anything, even after the error is fixed"                   | Critical | react   | Step 5 (**root-caused**)   |
| 7  | A `complexType` can never be created from the UI                          | High     | react   | Step 1                     |
| 8  | `DropdownChip` settings are decorative — hit policy / solver unchangeable | High     | react   | §2.3, Step 8, Step 9       |
| 9  | A rule can never be authored in boolean-expression form                   | Medium   | react   | §2.3, Step 8               |
| 10 | `rename` never migrates references — silently breaks the whole model      | Critical | both    | Step 10                    |
| 11 | The link check is model-global, so one broken row freezes every commit    | Critical | react   | Step 5, Step 6, Step 7     |
| 12 | Appending a record to a non-string-column relation silently does nothing  | High     | react   | §2.4, Step 3               |
| 13 | New condition columns are hardcoded `string`, so no numeric table is buildable | High | react | §2.3, Step 8               |
| 14 | `collect-matches` rulesets are unreachable                                | Medium   | react   | §2.3                       |

---

### Bug 1 — Untyped function/optimisation argument corrupts on round-trip, blocking every argument added after the first

**Severity: Critical.** This is the root cause behind both `Strange null error` and `Impossible to create more than
one function argument` from the original report — they are the same defect observed at two different moments.

- [x] Filed in `docs/BUG_REPORTS.md` (engine-level entry, see below)
- [ ] Workaround shipped in edgerules-react
- [ ] Regression test added (unit, real engine) and e2e test added

**Root cause (verified 2026-07-29 via isolated `@edgerules/node` repro, no React involved):**

`EDGERULES_API_SPEC.md`/`API_SPEC.md` §"Function Definition" documents `@parameters` values as one of a bare type
string, a `PortableTypedValue`, or **`null` for an untyped (unannotated) parameter**. `rowFactories.addArgument` and
`denormalize.ts`'s `parameters()` both follow that contract correctly — a fresh, untyped function argument is written
as JS `null`.

But the installed engine does not round-trip that `null` faithfully: after
`mutable.set('f', {..., '@parameters': {arg: null}, ...})`, the very next `mutable.toPortable()` returns
`'@parameters': {arg: 'null'}` — the **string** `"null"`, not JSON `null`. Minimal isolated repro, with the exact
output observed:

```ts
const mutable = MutableDecisionService.fromCode('{ func f(): "" }');
mutable.set('f', {
  '@kind': 'function',
  '@parameters': { arg: null },
  '@body': { '@kind': 'expression', expression: '""' },
});
// set() itself returns a correct schema: { '@kind': 'function-schema', '@parameters': { arg: 'any' }, … }
mutable.toPortable().f['@parameters']; // { arg: 'null' }  — should be { arg: null }

// Now the second Add argument, i.e. a whole-row commit built from what toPortable() just returned:
mutable.set('f', {
  '@kind': 'function',
  '@parameters': { arg: 'null', arg2: null },
  '@body': { '@kind': 'expression', expression: '""' },
});          // succeeds
mutable.link();
// throws: execution error: linker error: E102: unknown type 'null' in node NodeId(3)
//         — not a built-in type and no visible 'type null: …' definition
```

Note the asymmetry that makes this so easy to miss: `set()` **succeeds** and its own return value is correct; only
`toPortable()` (the editor's only read path) is wrong, and only the *next* write actually fails.

`normalize.ts`'s `parametersOf` reads that back as `{ name: 'arg', type: 'null' }` (a truthy string, so it takes the
"has a type" branch — line 45). The row now genuinely believes `arg` is typed `"null"`. The next whole-row commit —
e.g. a second `Add argument` click — round-trips that row back through `denormalize.ts`'s `parameters()`, whose
`else if (parameter.required === undefined) result[name] = parameter.type` branch writes the string `"null"` back out
as a **real type-name reference** (not a JSON null anymore). The engine's linker then rejects it with E102.

`createBoxedEditorService`'s `setWithLinkCheck` catches that failure and rolls the write back to the *previous*
(already-corrupted, single-argument) state, and `useRowActions`'s `add-argument` handler discards the returned
`PortableError` (Bug 5) — no cell is open to show it inline (unlike a value-cell edit). Net effect from the user's
chair: click "Add argument" a second time and **nothing visibly happens** — matching the original report exactly. The
E102 error only becomes visible later, whenever *any other* edit on that same function happens to re-trigger a
whole-row commit and its link check (e.g. editing the `result` expression) — which is why the original repro ("try
setting string as return type") looked unrelated to arguments at all: the error is a symptom of the earlier corrupted
argument, not of whatever cell was being edited when it surfaced.

**Suggested fix (edgerules-react side, defensive — does not require an engine upgrade):**

Treat the string `"null"` as equivalent to JSON `null` (i.e., "untyped") on both sides of the boundary, so the
corruption never compounds into a bad type reference:

- `normalize.ts` → `parametersOf`: `if (parameter === null || parameter === 'null') return { name };`
- `denormalize.ts` → `parameters()`: guard the same way before the `else if (parameter.required === undefined)`
  branch, so a parameter whose `type` is exactly `'null'` still denormalizes to JSON `null`, not a type reference.

Mark both guards with a comment naming the engine version they work around, so the upgrade skill can drop them.
The workaround has one accepted side effect: a user who genuinely writes a type named `null` (`type null: …`) can no
longer reference it. That is an acceptable trade — `null` is not a legal user type name in practice.

**Also file upstream:** append `docs/BUG_REPORTS.md` with the engine-level defect (untyped `@parameters` value does
not round-trip through `set()`/`toPortable()`), quoting the isolated repro above and the `API_SPEC.md` contract it
violates, per this repo's `CLAUDE.md` bug-reporting instructions.

**Regression tests to add once fixed:**
- Unit (`__tests__/commands.test.tsx`): brand-new function (`Add function`), `Add argument` **twice in a row**,
  assert two distinctly-named untyped parameters and that the model still links.
- Unit: same for `optimisation` (its "Add argument" path shares `addArgument`, just with a forced type — confirm the
  untyped-function path specifically, since that's the one that hits `null`).
- Unit (`__tests__/normalization.test.ts`): a parameter whose portable value is the string `'null'` normalizes to an
  untyped parameter — the direct guard test, independent of any UI.
- E2E: the "long flow" scenario in Part 2 must include this exact sequence.

---

### Bug 2 — No way to rename a function argument or a decision-table column after creation

**Severity: High.**

- [x] Confirmed root cause (by inspection)
- [ ] Fix designed (rename affordance) and implemented
- [ ] Regression test added

**Root cause (not an engine issue — purely missing UI):** `ArgumentHeaders.tsx` (function arguments),
`RulesetRow.tsx`'s `RulesetColumnHeaders` (condition/action columns) and `RelationRow.tsx`'s `RelationColumnHeaders`
all render each column name through `TypeName`, which is a **read-only** label with a hover/Alt tooltip
(`primitives/TypeName.tsx` — a `Box component="span"` inside a `Tooltip`, no click handler, no text field, nothing
editable). `useRowActions.ts`'s menu items for `function`/`ruleset`/`relation` only offer `Add argument`/`Add
condition column`/`Add action column`/`Add column` and `Delete "<name>" …` — there is no `rename-argument`/
`rename-column` action id in `menu/actions.ts`'s `rowActionRegistry` at all. The only way to rename a column today is
delete-and-recreate, which loses every rule/record cell already authored against it.

**Suggested fix:** add a `rename-column`/`rename-argument` row action (or make the header name itself clickable like
`NameCell` does for ordinary rows) that renames in place: for a `function`/`optimisation` argument, rewrite
`parameters[i].name` and every reference to the old name in the body/rules; for a `ruleset` condition/action column,
rewrite `parameters`/`actionColumns` and the corresponding key in every `rule`/`ruleset-default`'s `when`/`then`; for
a `relation` column, rewrite `columns` and every record's cell key.

**Reference migration is the editor's job, not the engine's** — see Bug 10: `MutableDecisionService.rename` does not
rewrite references anywhere, so a rename that doesn't migrate call sites itself leaves the model unlinkable. The
rename must be committed as a **single whole-row `setBoxedRowData`** with both the header and every dependent cell
already rewritten, so `setWithLinkCheck` either accepts the whole migration or rolls all of it back.

---

### Bug 3 — No way to change a column/argument's type after creation

**Severity: High.** Elevated from "inconvenience" — combined with Bug 13 it makes a numeric decision table
impossible to build from scratch at all, which is a hard blocker for the business flow (Step 8).

- [x] Confirmed root cause (by inspection)
- [ ] Fix designed and implemented
- [ ] Regression test added

**Root cause:** same as Bug 2 — `TypeName` is read-only. `addConditionColumn` hardcodes the new column's type to
`'string'` (`rowFactories.ts:423`); `useRowActions`'s `optimisation` branch hardcodes `'number'`; there is no
subsequent way to change either. A function argument's type can currently only be set indirectly and only once —
there is no menu action or inline control to edit `parameters[i].type` after the argument exists.

**Scope note — which constructs actually have a header-level type to edit:**
- `function`/`optimisation` arguments: `parameters[i].type` (and `.required`) — a real, editable type.
- `ruleset` **condition** columns: same `parameters[i].type`, required by the engine (`E301`).
- `ruleset` **action** columns: **no type of their own** — pure output shape, inferred from the authored `then`
  literals. There is nothing to edit; the "type" is changed by editing the cells. Tests must not expect otherwise.
- `relation` columns: **no type of their own** either — inferred from the records' cell literals, and constrained to
  be identical across every record (see Bug 12). §2.4 tests the cell-literal path, not a header control.

**Suggested fix:** pair with Bug 2's rename UI — an editable header (name + type) rather than static text, or a
dedicated "Edit type" menu action per argument/condition column, writing through the existing whole-row
`setBoxedRowData` path so the link check gates it. Changing a condition column's type must re-validate every rule
cell in that column in the same commit (a `string` column holding `"retail"` retyped to `number` must fail as one
atomic rejection, not leave half a table committed).

---

### Bug 4 — Column/argument drag handles are decorative, not functional

**Severity: Medium.**

- [x] Confirmed root cause (by inspection)
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

**Semantics to pin down before implementing:** for a `function`/`optimisation`, argument order is the **positional
call-site order**, so reordering arguments changes the meaning of every existing call — the fix must either rewrite
call sites too or be restricted to keyword-call models. For a `ruleset`/`relation`, column order is presentational
only (`when`/`then` and record cells are name-keyed), so a reorder is safe. That asymmetry needs a decision, and the
e2e assertions differ accordingly (§2.2 asserts execution is unchanged; §2.3/§2.4 assert only the DOM order).

---

### Bug 5 — Errors from container-level "Add …" / "Delete …" actions are swallowed

**Severity: High** — this is what makes Bugs 1, 11, 12 and 13 look like "nothing happens" instead of a visible,
actionable error, and is worth fixing independently of any of them.

- [x] Confirmed root cause (by inspection)
- [ ] Fix designed and implemented
- [ ] Regression test added

**Root cause:** every `onSelect` handler built in `useRowActions.ts` calls `commands.setBoxedRowData(...)` (or
`commands.remove(...)`) and **discards the returned `PortableError`** — e.g. `add-argument`: `commands.setBoxedRowData(
row.path, addArgument(table))` with no assignment, no check, no surfaced feedback. `NewRow.tsx`'s `onActivate`
handlers (`appendListItem`/`appendRelationItem`/`appendRule`/`appendOptimisation*`) do exactly the same. Contrast
with `ExpressionCell`'s value-cell commit path, which keeps the returned error and renders it inline (`role="alert"`,
per `e2e/boxed-editor/fields-and-lists.spec.ts`'s existing "reports invalid values" test). A user driving the
three-dot menu or the trailing "(new …)" placeholder currently has **no way to learn the action failed** — the row
silently doesn't change, with no toast, no alert, nothing in the DOM to assert against either.

**Suggested fix:** surface the `PortableError` from every mutating menu action *and* every `NewRow` append the same
way a value-cell commit does — a shared toast/alert channel keyed by the acting row's path, so `RowActionsMenu`- and
`NewRow`-driven mutations get the same visibility guarantee as `ExpressionCell`-driven ones. Give it a stable
`role="alert"` and a `data-testid` (`row-error-${path}`) so e2e can assert *which* row failed, not just that
something did.

---

### Bug 6 — "Cannot create anything, even after the underlying error is fixed" — **root-caused, see Bug 11**

**Severity: Critical.**

- [x] Reproduced with a minimal, written-down repro script (verified 2026-07-29)
- [x] Root-caused — it is Bug 11's model-global link latch
- [ ] Fixed
- [ ] Regression test added

The original report's wording ("you cannot add anything even error is fixed") implied some **global**, not
row-scoped, latch. There is one, and it is not a React state bug at all: it is `setWithLinkCheck` calling
`mutable.link()`, which validates the **whole model**, combined with `remove`/`rename`/`move` deliberately *not*
link-checking (Resolved Decision #12). Full mechanism, repro and fix are in Bug 11 below. This entry stays only as
the user-facing symptom it was reported as; do not investigate it separately.

The recovery path *does* exist (repairing the dangling reference re-links the model and unblocks every subsequent
commit — verified), but it is undiscoverable: nothing in the UI says which row is broken, and Bug 5 means the failing
commits say nothing at all.

This scenario must be the *first* checkpoint of the long business-flow e2e test in Part 2 — it is exactly the kind of
thing a short, isolated unit test won't catch, but a long, stateful flow will.

---

### Bug 7 — A `complexType` can never be created from the UI

**Severity: High.** Blocks Step 1 of the business flow and leaves one of the 21 `BoxedRowKind`s unreachable.

- [x] Confirmed root cause (by inspection); engine support verified 2026-07-29
- [ ] Fix designed and implemented
- [ ] Regression test added

**Root cause:** the editor renders, normalizes, denormalizes, duplicates, deletes and adds fields to a `complexType`
row — but nothing creates one. Specifically:
- `menu/actions.ts`'s `rowActionRegistry` has no `add-complex-type` id.
- `useRowActions.ts`'s `pushContainerAdds` offers exactly `add-field`, `add-function`, `add-optimisation` (root only),
  `add-ruleset`, `add-relation`, `add-list` — no type.
- `commands/rowFactories.ts` has a `rowFactories.complexType` entry but **no `nextComplexTypeRow`** the way every
  other kind has (`nextFieldRow`, `nextFunctionRow`, `nextRulesetRow`, `nextRelationRow`, `nextListRow`,
  `nextOptimisationRow`), so no caller could reach it even if a menu item existed.
- `NewRow.tsx`'s `NEW_ROW_CONFIG` maps `model`/`context` to `itemKind: 'field'`, so the trailing placeholder can't
  produce one either.
- The `field` row's `Convert to …` actions offer `context`/`relation`/`list` only.

A `complexType` is therefore reachable **only** by loading a model that already contains a `type X: {…}` declaration
(as `FullModel`/`FunctionBodies` do). Note the editor's own `complexTypeOwner` coalescing in
`createBoxedEditorService` exists precisely to support editing them — the create path is the only missing piece.

**Verified the engine supports it** (so this is purely a missing UI action):

```ts
const m = MutableDecisionService.fromCode('{ x: 1 }');
m.set('Applicant', { '@kind': 'type-definition', name: 'string', age: 'number' });
m.link();                        // OK
m.toPortable().Applicant;        // { '@kind': 'type-definition', name: 'string', age: 'number' }
```

**Suggested fix:** add an `add-complex-type` action id + icon, a `nextComplexTypeRow(container, existingNames)`
factory (seeding one `string` member, mirroring `nextFieldRow(…, isTypeMember=true)` — an empty `type X: {}` should be
checked against the linker before being chosen as the default), and push it from `pushContainerAdds` for both `model`
and `context`. Then confirm the second half of the story works: a field can actually *reference* the new type
(`application.applicant: <Applicant, required: true>`), which today is only reachable by typing the annotation into a
value cell by hand.

---

### Bug 8 — `DropdownChip` settings are decorative: hit policy and solver settings cannot be changed

**Severity: High.** Same false-affordance class as Bug 4, on a much more important control.

- [x] Confirmed root cause (by inspection)
- [ ] Fix designed and implemented
- [ ] Regression test added

**Root cause:** `primitives/DropdownChip.tsx` renders a label plus an `ArrowDropDownIcon` and **nothing else** — no
`onClick`, no `Menu`, no options list, no `role`. Its own doc comment says it "opens a dropdown in the real editor",
which never landed. Both consumers are affected:
- `RulesetHitPolicyRow.tsx` — `hitPolicy` is display-only. `first-match` can never become `best-match`,
  `unique-match` or `collect-matches`.
- `OptimisationSettingRow.tsx` — `using` (and `bottlenecks`, if present) is display-only; only `timeLimit` gets a real
  `ExpressionCell`.

Consequences beyond the chip itself:
- `RulesetRow`'s `showPriority` is driven by `hitPolicy === 'best-match'`, so the whole **priority column** — header,
  every `RuleRow` cell, `commitPriority`'s validation — is dead code from the UI's perspective. It can only be seen in
  a story that hardcodes `best-match`.
- `nextOptimisationRow` seeds only a `using` setting. `bottlenecks` and `timeLimit` have **no create path at all**
  (no menu action, no `NewRow` config for `optimisation`), so an optimisation built from scratch can never have them.

**Suggested fix:** make `DropdownChip` a real picker (`MenuItem` list, `role="button"` + `aria-haspopup`), driven by a
per-consumer options list — hit policy from the engine's accepted set, solver backends from whatever
`OPTIMISATION_METAPHOR_SPEC.md` lists — committing through `setBoxedRowData` on the owning row so the link check
gates it. Separately, add `bottlenecks`/`timeLimit` to the `optimisation` row's menu as `Add setting` items (they are
name-keyed children of the `optimise` declaration, so an append is an ordinary owner-coalesced write).

**Engine-accepted hit policies, verified 2026-07-29:** `first-match` ✅, `best-match` ✅, `unique-match` ✅,
`collect-matches` ✅ *(but see Bug 14)*. Anything else is `E302`.

---

### Bug 9 — A rule can never be authored in boolean-expression form

**Severity: Medium** (High for the business flow, which needs both forms in one table).

- [x] Confirmed root cause (by inspection)
- [ ] Fix designed and implemented
- [ ] Regression test added

**Root cause:** `RuleRow.tsx`'s `RuleCells` branches on `hasExpression = row.conditionsExpression !== undefined`:
- If it is `undefined` (every rule `appendRule` creates — it seeds `conditions: conditionColumns.map(() => '')` and
  never sets `conditionsExpression`), the cell-map UI renders and `commitConditionsExpression` is **unreachable**.
- If it is set (only possible by loading a model that already authored `when:` as a boolean expression, as
  `RulesetCrud` does), the single expression cell renders — and committing any *other* cell is impossible, because
  the per-column cells aren't rendered.
- Worse, the one available transition is destructive and one-way: `commitConditionCell` sets
  `conditionsExpression: undefined`, so an expression-form rule silently becomes cell-map the first time a column
  cell is edited — with no way back.

So: cell-map → expression is impossible; expression → cell-map is possible but irreversible and undiscoverable.

**Also note:** on a ruleset with **zero** condition columns (what `Add decision table` creates), `conditionColumns` is
empty, so `RuleCells` renders no condition cells at all — a freshly created rule has literally nothing to click in
its condition half until a condition column is added first. Tests must add columns before rules, or assert this
explicitly.

**Suggested fix:** a per-rule toggle (menu action `Switch to expression condition` / `Switch to column conditions`, or
a small chip in the conditions header) that flips `conditionsExpression` between `undefined` and a seeded value, in a
single whole-`rule` commit. Going expression → cell-map must warn or clear rather than silently drop the authored
expression, since the two representations are not mechanically convertible.

---

### Bug 10 — `rename` never migrates references, silently breaking the whole model

**Severity: Critical.** Verified 2026-07-29.

- [x] Reproduced against the real engine
- [x] Filed in `docs/BUG_REPORTS.md` (engine-level entry)
- [ ] Decided where the fix belongs (engine vs editor)
- [ ] Fixed
- [ ] Regression test added

**Repro (no React):**

```ts
const m = MutableDecisionService.fromCode('{ application: { loanAmount: 1000 } total: application.loanAmount * 2 }');
m.rename('application', 'app');   // returns undefined = success
m.link();
// throws: execution error: linker error: E102: unresolved reference 'application.loanAmount' in node NodeId(3)
```

The same holds one level down (renaming `ctx.a` leaves a sibling's `a + 1` dangling), so it is not a root-only
special case. `toPortable()` confirms the referring expression is left byte-identical — the rename touches the key
only.

**Why the editor makes this worse rather than catching it:** `useRowCommands.rename` calls `service.rename` and
returns `undefined` on success; `createBoxedEditorService`'s `rename` deliberately performs **no** link check
(Resolved Decision #12 — "those may legitimately leave a *different* row's reference dangling, and rolling them back
would make renaming/removing anything another row still refers to impossible"). That decision is defensible in
isolation, but combined with Bug 11 it means a single innocuous rename can put the model into a state where **no
further edit anywhere can be committed**, with no error shown at any point.

`NameCell`-driven renames (every named row) and any future argument/column rename (Bug 2) are both affected.

**Suggested fix — pick one and write it down:**
1. **Engine** (preferred): `rename` rewrites every reference to the renamed path, as a rename refactor should. File
   upstream in `docs/BUG_REPORTS.md`; check `../edgerules-v2/tests/wasm/crud.test.ts` for the intended contract first.
2. **Editor**: before committing a rename, scan the portable tree for references to the old path, rewrite them, and
   commit the rename plus every rewritten expression as one operation — rolling everything back if the result doesn't
   link. This is substantial work and duplicates the engine's own name resolution, so prefer (1).
3. **Minimum viable, ship regardless of 1/2**: make `rename` link-check like `setBoxedRowData` does, and surface the
   error (Bug 5's channel) instead of silently corrupting the model. Whether it rolls back or merely warns is the
   Resolved-Decision-#12 trade-off to revisit — but "succeeds silently and freezes the editor" is not a valid option.

---

### Bug 11 — The link check is model-global, so one dangling reference freezes every subsequent commit

**Severity: Critical.** This is Bug 6's actual root cause. Verified 2026-07-29.

- [x] Reproduced against the real engine
- [ ] Fix designed and implemented
- [ ] Regression test added

**Mechanism:** `setWithLinkCheck` (`createBoxedEditorService.ts:445`) runs `mutable.link()` after every
`setBoxedRowData` and rolls the write back if it throws. `link()` validates the **entire model**, not the written
subtree. Meanwhile `remove`, `rename` and `move` skip the check entirely by design. So any `remove`/`rename`/`move`
that leaves a dangling reference puts the model into a globally unlinkable state — and from that moment every
`setBoxedRowData` **anywhere in the model** fails its link check and is rolled back, no matter how unrelated it is.

**Repro (no React):**

```ts
const m = MutableDecisionService.fromCode('{ application: { loanAmount: 1000 } total: application.loanAmount * 2 }');
m.remove('application');                 // succeeds, no error, no link check
m.link();                                // E102: unresolved reference 'application.loanAmount'
m.set('unrelated', 42);                  // the *write* succeeds …
m.link();                                // … but the model still doesn't link, so setWithLinkCheck rolls it back
// → in the editor: "Add field" on the model root does nothing, forever, with no error (Bug 5)
```

**Recovery works, but is undiscoverable** (also verified): repairing the dangling expression re-links the model, and
every subsequent commit succeeds again.

```ts
m.set('total', { '@kind': 'expression', expression: '0' });  // this one commits: the model links again
m.link();                                                    // OK
m.set('newField', 7);                                        // OK from here on
```

So the user's "you cannot add anything even error is fixed" is precise about the symptom and slightly off about the
cause: it's not that the *fix* doesn't help, it's that nothing tells you **which** row needs fixing, and every
attempt to do anything else silently no-ops until you happen to fix it.

**Suggested fix (all three, they're complementary):**
1. **Surface it.** When `setWithLinkCheck` rolls back with a link error whose `path` is *not* the row being written,
   report it as a model-level problem naming the offending path — a persistent banner ("`total` refers to
   `application.loanAmount`, which no longer exists"), not a transient per-cell alert. This alone converts an
   unusable editor into a merely annoying one.
2. **Distinguish the two failure modes.** A link error caused by the current write should reject that write (today's
   behavior, correct). A link error that was *already present before* the write should not block it — snapshot
   linkability before the `set` and only roll back when the write made it worse.
3. **Stop creating the state.** Bug 10's fix (rename migrates references) and a matching pre-flight on `remove`
   ("`x` is still referenced by `y` — delete anyway?") remove most of the ways in.

**Regression tests to add:** a unit test that removes a referenced row, then asserts an unrelated `Add field`
**succeeds** (post-fix-2) or at minimum **reports a visible, path-naming error** (post-fix-1); and the business
flow's Step 5 checkpoint.

---

### Bug 12 — Appending a record to a relation with any non-`string` column silently does nothing

**Severity: High.** Verified 2026-07-29.

- [x] Reproduced against the real engine
- [ ] Fix designed and implemented
- [ ] Regression test added

**Root cause:** `appendRelationItem` seeds every cell of the new record with `BLANK_LITERAL` (`""`). EdgeRules arrays
are homogeneous *by structural type*, so a record of all-empty-strings does not match existing records whose columns
are numeric/boolean/date — `link()` rejects it and `setWithLinkCheck` rolls the append back. Combined with Bug 5
(`NewRow`'s `onActivate` discards the error), clicking the trailing "(new row)" placeholder on any realistic relation
is a **silent no-op**.

```ts
// existing: [ { name: "a", value: 1 } ] — append a blank record:
m.set('rel', [ …existing, { '@kind':'context', name:{…'""'}, value:{…'""'} } ]);  // set() succeeds
m.link();
// throws: type mismatch in node NodeId(3): expected {name: string; value: number},
//                                          found    {name: string; value: string}
```

`appendRelationItem`'s own doc comment currently claims "a non-`string`-typed column still needs the user's first
real edit before it round-trips" — that is wrong, and should be corrected as part of the fix: the user never gets to
make that first edit, because the append itself never commits. The same reasoning applies to `addRelationColumn`,
which backfills `BLANK_LITERAL` into every existing record (safe only because a brand-new column has no prior type to
conflict with).

**Suggested fix:** seed each cell from the **previous record's** literal for that column, coerced to a blank-but-
type-compatible default the way `compatibleListItemDefault` already does for lists (`0` for numeric, `false` for
boolean, `""` for string, the previous literal otherwise). Extract that helper and share it. Where no previous record
exists, `""` remains the right default.

---

### Bug 13 — New condition columns are hardcoded `string`, so no numeric/date decision table can be built from scratch

**Severity: High.** A direct consequence of Bug 3, called out separately because it is a *hard blocker* for the
business flow rather than a missing convenience.

- [x] Confirmed root cause (by inspection); consequence verified 2026-07-29
- [ ] Fix designed and implemented (ships with Bug 3)
- [ ] Regression test added

`addConditionColumn` writes `{ name: columnName, type: 'string' }`. Every realistic decision table's conditions are
ranges and comparisons on numbers or dates (`age: 18..25`, `income: < 30000`, `applicationDate: >= date("2026-01-01")`).
With a `string`-typed column those are rejected outright:

```ts
// ruleset risk(age: string) with a rule `when: { age: 18..25 }`
// linker error: type mismatch in node NodeId(3): expected string, found number
```

…which, via Bug 5, surfaces as the rule cell edit "just not sticking". So today the *only* buildable-from-scratch
decision table is one whose every condition is a string equality. Bug 3's fix must therefore land before §2.3's type
matrix and the business flow's Step 8 can be written at all — and Bug 3's fix should also reconsider the default: a
type picker shown at column-creation time is better than any hardcoded default.

---

### Bug 14 — `collect-matches` rulesets are unreachable from the editor

**Severity: Medium.** Verified 2026-07-29.

- [x] Reproduced against the real engine
- [ ] Fix designed and implemented
- [ ] Regression test added

`nextRulesetRow` always seeds a `ruleset-default` child, deliberately (its doc comment: a ruleset with neither rules
nor a default can't infer its result type, `E308`). `normalizeRuleset` marks that row `deletable: false`, and
`useRowActions`'s `ruleset-default` branch offers `Delete` only as a disabled-by-`deletable` no-op. But the engine
**rejects** a `default` under `collect-matches`:

```
linker error: E306: ruleset 'r' has a 'default' under hitPolicy "collect-matches"
```

So even once Bug 8 makes the hit-policy chip real, `collect-matches` can never be selected: the mandatory `default`
makes it unlinkable, and there is no way to remove the default. `first-match`, `best-match` and `unique-match` all
accept a default and are fine.

**Suggested fix:** make `default`'s `deletable` conditional on the current hit policy, and have the hit-policy picker
drop the `default` row in the same commit when switching to `collect-matches` (and re-seed it when switching away).
Whichever way, the two settings must be committed together — they are not independently valid.

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
column reorder, rule-matrix maintenance, ruleset execution with varied inputs, drag-and-drop, descriptions,
test-result integration, or recovery from a rejected whole-row commit (Bugs 1, 5, 6, 10, 11, 12 all live in this gap).

Equally important: **no test anywhere builds a model from nothing.** Every existing test starts from a story that
already contains the construct it edits, which is exactly why the create-path bugs (7, 9, 12, 13, 14) went unnoticed.

### 2.1a E2E directory organization — done

The old `e2e/` was a flat list of one-spec-per-component files (`boxed-editor.spec.ts`, `code-editor.spec.ts`,
`code-editor-cell.spec.ts`, `decision-table.spec.ts`, `project-explorer.spec.ts`, `tests-manager.spec.ts`), each
hand-building `page.goto('/iframe.html?id=…&viewMode=story')` calls independently. Adding five more boxed-editor
specs (2.2–2.6) on top of that would have made boxed-editor dominate a directory shared with five unrelated
components. Reorganized as:

```
e2e/
  support/
    storybook.ts          # openStory(page, id), storyIndex(page), storyIdsWithPrefix(page, prefix)
  boxed-editor/
    helpers.ts             # openBoxedEditorStory, valueCell, commitExpression, renameRow, replaceActiveExpression,
                            # appendListItem, addList, chooseRowAction — extracted from the old flat spec
    columnHelpers.ts       # NEW — shared column-CRUD assertions run against both ruleset and relation (§2.4)
    rendering.spec.ts      # the "every story renders" smoke test
    fields-and-lists.spec.ts   # root/context/complex-type field CRUD + list boundary values + read-only
    functions.spec.ts          # NEW — §2.2
    decision-tables.spec.ts    # NEW — §2.3
    relations.spec.ts          # NEW — §2.4
    edge-cases.spec.ts         # NEW — §2.5 (cross-cutting: naming, empties, dnd, overlays, readOnly, a11y)
    business-flow.spec.ts      # NEW — §2.6
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
  has distinct concerns. A `helpers.ts` alongside them holds component-local shared setup; Playwright's default
  `testMatch` only picks up `*.spec.ts`/`*.test.ts`, so a `helpers.ts` is never mistaken for a test file and needs no
  config change.
- **`e2e/support/` is for cross-component helpers only** (today: the generic Storybook `openStory`/`storyIndex`
  navigation used by every component). Component-specific helpers stay local to that component's directory, never
  promoted to `support/` just because a second file in the same component wants them too.
- **Group with `test.describe('<Component> / <concern>', ...)`** inside every spec file, so reporter output groups
  sensibly regardless of directory/file layout.
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

**Correction to a wrong assumption in the previous revision of this plan:** `EditableHarness`'s `live-payment` caption
is **not** an execution result — it reads a committed row's source text
(`service.getBoxedRowData('payment')?.value`). There is currently **no** story harness anywhere that executes the
model. Every "assert the live result" bullet below therefore depends on building one first:

- [ ] `ExecutingHarness` — a new story harness wrapping `BoxedEditor` with an execution caption. Requirements, all
      confirmed against the installed engine:
      - `execute(method, input?)` is **async** (`Promise<unknown>`) — the caption needs `useEffect` + state, and every
        e2e assertion against it must be a Playwright auto-retrying `expect(...).toHaveText(...)`, never a one-shot read.
      - Re-run on every `onChange`, keyed by a revision counter, exactly as `TestCasesAndTestRunnerHarness` does for
        `TestRunner`.
      - Render the outcome under a stable `data-testid="live-result"`, and **render errors too** (a structural edit
        that breaks linking must show up as a failed run, not a stale previous value — otherwise the assertion is
        vacuous).
      - For any story containing an `optimise` declaration, call `mutable.registerSolver(...)` before executing:
        `requiresSolver()` is `true` and `TestRunner`/`execute` refuse to run without one. `highs` is **not** a
        dependency of this repo — use a canned-solution stub exactly like
        `src/components/boxed-editor/__tests__/normalization.test.ts:202`, and make the stub's returned values
        deterministic so §2.6's Step 13 can assert them.
- [ ] `FunctionCrudPlayground` — a model with **one existing multi-arg function** (so tests can both mutate an
      existing signature and grow a brand-new one from zero), rendered through `ExecutingHarness` with a fixed input
      set so execution correctness is visible on screen after every structural edit.
- [ ] `DecisionTableCrudPlayground` — a `ruleset` with both rule-condition forms (cell-map and boolean-expression, cf.
      `RulesetCrud`), **typed condition columns** (`number`/`string`/`date` — unreachable via the UI per Bug 13, so
      the fixture must supply them), a `best-match` variant so the priority column is reachable while Bug 8 is open,
      plus `ExecutingHarness`, so column/rule edits are checked against real execution output, not just DOM text.
- [ ] `RelationCrudPlayground` — a `relation` with 3+ columns of **mixed** types (string, number, and a
      complex/drill-down column), and 3+ records, to cover column CRUD on the *other* table-shaped construct and to
      make Bug 12 reproducible from a story.
- [ ] `BlankModel` — `MutableDecisionService.fromCode('{}')` (or the minimal equivalent), no other setup, wrapped in
      `ExecutingHarness`. This is the **only** fixture §2.6's business-flow spec is allowed to load — see 2.6.0: that
      spec must construct everything itself via `Add …` actions, not start from an already-populated model like the
      three playgrounds above.

Sanity-check every new fixture by executing it once in the story before writing tests against it — a fixture that
doesn't link makes every downstream assertion meaningless in a way that's very hard to debug from a Playwright
failure.

### 2.2 Function CRUD matrix (new e2e spec: `e2e/boxed-editor/functions.spec.ts`)

- [ ] Create a function from scratch (`Add function` on model root and inside a nested `context`), verify default
      shape (blank synthesized `result`, zero arguments) and that the auto-name is `function`, then `function2` on a
      second add (`uniqueName`).
- [ ] Add arguments **one at a time up to 5**, asserting after *each* click that the previous arguments are still
      present and distinctly named (this is the exact shape that catches Bug 1 — a test that only adds one argument,
      like the current unit test, cannot).
- [ ] Rename each of the 5 arguments (once Bug 2 is fixed) and confirm the body/result expression referencing them by
      old name is migrated in the same commit (per Bug 2's fix note — reference migration is the editor's job).
- [ ] Reorder arguments (once Bug 4 is resolved either via real drag or a "Move" action) and confirm the decision
      recorded in Bug 4 holds: either call sites were rewritten too, or the reorder was refused for a positional-call
      model. Assert execution output is unchanged either way.
- [ ] Change each argument's type (once Bug 3 is fixed) across the full type matrix: `number`, `string`, `boolean`,
      `date`, a `type X: {...}` complex type, and an array type (`T[]`). Include the `required: true` variant, since
      `denormalize.parameters()` has a third branch for it that nothing currently exercises.
- [ ] Delete an argument that the body *doesn't* reference (must succeed) and one that it *does* reference (must be
      rejected with a visible error, never a silent no-op — this is Bug 5's regression test in miniature).
- [ ] Convert an inline single-expression function body into a multi-statement body (via `function-result`'s
      `Duplicate`, the only path that does this — see `useRowActions`'s `function-result` branch) and verify the
      synthesized `result` row behaves per `FunctionResultRow`'s documented constraint (never independently
      addressable while inline). **Then assert what the reverse actually does**: there is no "collapse back to
      inline" action today — if deleting the extra body fields doesn't restore the inline form, record that as a
      finding rather than asserting a behavior that doesn't exist.
- [ ] Nested function inside a `context` (`group.nested`, per the existing `FunctionBodies` story) — repeat the
      add-argument-twice and rename checks at non-root depth, since several of the confirmed bugs are path-math bugs
      that could behave differently once nested. Add one at **three** levels deep (`a.b.fn`) too: `parentPathOf`/
      `childPath` math is the shared failure mode.
- [ ] Duplicate a function, confirm auto-renaming (`fn` → `fn2`) and that argument/body edits on the duplicate never
      affect the original.
- [ ] Delete a function that another row calls — assert the post-Bug-11 behavior (a visible, path-naming model-level
      error) and that an unrelated `Add field` still works afterwards.
- [ ] Execute the function end-to-end after every structural edit above via `ExecutingHarness`'s `live-result` — a
      structural edit that "looks right" in the DOM but breaks linking must fail the test.

### 2.3 Decision table (ruleset) CRUD matrix (new e2e spec: `e2e/boxed-editor/decision-tables.spec.ts`)

- [ ] Create a decision table from scratch (`Add decision table`), verify the seeded `hitPolicy`/empty `default` per
      `nextRulesetRow`, and that the table **links immediately** with zero rules (the reason the default is seeded).
- [ ] Assert the zero-condition-column state explicitly: a rule added before any condition column exists renders no
      condition cells at all (Bug 9's second note) — this is current behavior and must either be asserted or fixed.
- [ ] Add condition columns and action columns up to 4 each; verify every existing rule's cell count grows in lock-
      step (this is the ruleset analogue of the function-argument test above, and should be written the same way —
      add repeatedly, assert cumulative state each time, not just the end state). Include the `ruleset-default` row in
      the assertion: `addActionColumn` extends it too, `addConditionColumn` deliberately does not.
- [ ] Rename a condition column and an action column (once Bug 2 is fixed); confirm every rule's `when`/`then` key
      migrates together, not just the header, **and the `default` row's `then` key with them**.
- [ ] Change a condition column's type (once Bug 3/13 are fixed): numeric range (`18..25`), comparison (`>= 65`),
      equality, `date`, `boolean`, and a string/enum column. Assert the failing direction too: retyping a column whose
      existing cells no longer fit must be rejected atomically, leaving every cell as it was.
- [ ] Reorder columns (once Bug 4 is resolved) and confirm rule cells reorder with the header, not independently, and
      that execution output is unchanged (ruleset columns are name-keyed, so a reorder is presentational).
- [ ] Add a rule, duplicate a rule, delete a rule, and reorder rules by drag (this path *is* wired — it's row-level,
      not column-level — so this part of the matrix can be written today without waiting on any fix above). Assert
      `first-match` semantics actually follow the new order after a drag, via `live-result`.
- [ ] Switch a rule between the two authoring forms — cell-map (`{age: 18..25, income: <30000}`) and boolean-
      expression (`age >= 65`) — and back; verify the correct `RuleRow` sub-UI renders each time
      (`conditionsExpression` vs per-column cells, per `RuleRow.tsx`). **Gated on Bug 9** — until it's fixed, assert
      the current one-way behavior instead (editing a column cell on an expression-form rule silently converts it),
      so the fix flips a real, existing test.
- [ ] Author an `any` condition cell (blank = "any", per `denormalize`'s `ruleNode`) and confirm the committed model
      omits the key entirely, and that a rule of all-blank conditions matches everything.
- [ ] Edit the pinned `default` row's action cells; confirm it can't be deleted (`deletable: false`) and isn't
      offered a `Duplicate`.
- [ ] Switch `hitPolicy` across **all four** engine-accepted values — `first-match`, `best-match`, `unique-match`,
      `collect-matches` — and confirm the `priority` column appears/disappears exactly under `best-match`
      (`RulesetRow`'s `showPriority`, header + every rule row). **Gated on Bug 8**; `collect-matches` additionally
      gated on Bug 14.
- [ ] Under `best-match`, assert `priority` is **required** on every rule (engine contract) and that
      `commitPriority`'s non-numeric guard surfaces `Priority must be a whole number` as a visible alert.
- [ ] Execute the table with inputs that hit: the first rule, a later rule, no rule (falls through to `default`),
      exactly one rule under `unique-match`, multiple rules under `unique-match` (must error), and — under
      `best-match` — a genuine priority tie.

### 2.4 Relation (table-shaped collection) CRUD matrix (new e2e spec: `e2e/boxed-editor/relations.spec.ts`)

- [ ] Add/rename/reorder/delete columns (the same operations as §2.3, on `relation` rather than `ruleset`) — write
      this as a small shared helper module (`e2e/boxed-editor/columnHelpers.ts`) so the same assertions run against
      both `relation` and `ruleset` column headers without duplicating the whole spec. Relations have **no header-level
      type control** to test (see Bug 3's scope note) — the type matrix here runs through cell literals instead.
- [ ] Add/duplicate/delete records; verify a newly-added record's cells default per `appendRelationItem`'s
      column-alignment rule.
- [ ] **Bug 12 regression:** append a record to a relation with a numeric column. Today this silently does nothing;
      after the fix it must produce a type-compatible blank record that commits. Assert the record actually appears
      *and* the model still links — asserting the DOM alone would pass against a rolled-back write.
- [ ] Re-author a column's cell values across the type matrix (number → string → boolean) and confirm the engine's
      homogeneous-array constraint is enforced consistently: changing one record's cell to a different type must be
      rejected with a visible error and leave every other record untouched.
- [ ] Delete a column and confirm every record's cell for that column is removed with it; delete the **last**
      remaining column and confirm the relation survives as an empty-column table rather than becoming unreadable.
- [ ] Drill down into a record whose cell holds a complex object (per `RelationItemRow`'s `drillDownNames` logic) and
      edit a nested field there. Also assert the entry path: typing a complex literal (`{ city: "Vilnius" }`) into a
      flat cell converts it into a drill-down whose own cell then renders **blank and non-interactive**
      (`RelationCells` returns `null` for a drill-down column) — that transition is one-way from the UI's
      perspective and must be either asserted or filed as a finding.
- [ ] Reorder records by drag and confirm order is reflected in execution output (array order is semantic).

### 2.5 Cross-cutting edge cases (new e2e spec: `e2e/boxed-editor/edge-cases.spec.ts`)

None of these belong to one construct, and none are covered anywhere today. They are ordered by how likely they are
to be hit by a real user.

**Naming**
- [ ] Rename to a name that already exists among siblings — must be rejected visibly, not silently overwrite.
- [ ] Rename to an empty string — `NameCell`'s cleared-name special action (per `rowFactories.removeArgument`'s doc
      comment, a cleared argument name means *delete*). Assert which of "delete" / "reject" actually happens for each
      kind; they should not differ arbitrarily.
- [ ] Names that aren't valid DSL identifiers: spaces, dots (`a.b` — would corrupt path math), leading digits,
      `@`-prefixed (reserved), DSL keywords (`func`, `ruleset`, `type`, `default`), and a non-ASCII name.
- [ ] `uniqueName` collision chains: add three functions in a row → `function`, `function2`, `function3`; delete
      `function2`, add another → must not collide.
- [ ] **Bug 10 regression:** rename a row that another row references, then assert the reference followed it (post-fix)
      and that the model still executes.

**Empty and boundary states**
- [ ] Empty list (`Add list`, no items) — renders, links, executes.
- [ ] Empty relation (no columns, no records) and a relation with columns but no records.
- [ ] Function with zero arguments; ruleset with zero rules; optimisation with the seeded single variable only.
- [ ] Delete the last item of every container kind: last list item, last record, last rule, last argument, last
      condition column, last action column, last field of a `complexType`. Each must leave a valid, linking model.
- [ ] Delete the only child of a `context`, then the `context` itself.
- [ ] List type homogeneity: append to a numeric list and to a boolean list, confirming
      `compatibleListItemDefault`'s seeding; then try committing a mismatched literal and assert the visible error.
- [ ] Very long names and very long expressions (the ellipsis/`minWidth: 0` overflow path in `TypeName`/`Cell`) —
      assert no horizontal overflow and that the value is still committable.
- [ ] `LargeModel` (200 rows) — smoke that editing row 199 is responsive and that the grid virtualizes/renders.

**Editing semantics**
- [ ] At most one `ExpressionCell` is active at a time (`activeCellPath`) — clicking a second cell while one is open
      commits or cancels the first, never leaves two editors mounted.
- [ ] Escape cancels and restores the previous value; blur behaves per spec; `Enter`/`F2` on a focused static cell
      activates it (keyboard-only authoring path, currently untested).
- [ ] Clearing a value cell that has no `onCommit` override shows `A value is required.` and keeps the cell open.
- [ ] An active cell survives an unrelated row's mutation (no remount, no lost draft).
- [ ] Commit a parse error, then fix it — assert `role="alert"` appears and then clears, and that
      `expressionErrorMessage`'s trailing-operator special case fires (`application.loanAmount /` →
      `Expected a value after "/".`).
- [ ] `onChange` fires exactly once per **successful** commit and never on a rejected one (the existing
      `boxed-change-count` caption already makes this observable — nothing asserts it end-to-end today).

**Drag and drop** (`dnd/dropRules.ts` — wired, entirely untested in e2e)
- [ ] Reorder within a container for every movable kind (`MOVABLE_KINDS`: field, context, complexType, list,
      relation, function, ruleset, optimisation, list-item, relation-item, rule, optimisation-variable,
      optimisation-constraint).
- [ ] Reparent across containers where allowed; assert the invalid cases render the **red** outline
      (`NewRow`/`useRowDrop`'s `canDrop` styling) and change nothing on drop.
- [ ] Drop onto the trailing `append-<path>` placeholder (append-at-end path).
- [ ] Drag a non-movable kind (`ruleset-hit-policy`, `optimisation-setting`, `function-result`, `model`) — no handle
      should exist at all.
- [ ] A `list-item` drop with a mismatched literal kind (`inferLiteralKind`) — gated in the preview, and if it gets
      through, rejected by `move()` with a visible error.
- [ ] Reorder rules by drag and confirm `first-match` evaluation order follows (also in §2.3 — keep one of the two).

**Overlays and side panels**
- [ ] `DescriptionCell`: type a description (`aria-label="description <path>"`), rename the row, and confirm the
      description followed it (`useRowCommands`'s `migrateOverlayPaths` — completely untested end-to-end).
- [ ] Same for a **subtree** rename: description on a nested child, rename the ancestor, description must follow
      (this is the per-descendant loop in `migrateOverlayPaths`, the part most likely to regress).
- [ ] Same for test-case cells (`TestCasesService.renamePath`) after a rename **and** after a drag-move.
- [ ] Test results column: a passing and a failing case render distinctly per row; `scheduleTestRun` coalesces a
      burst of edits into one run.
- [ ] `showDescription`/`showTestResults` off → those columns are absent from the grid template, not just hidden.

**Read-only and other modes**
- [ ] `readOnly`: every mutating menu item is gone, `NewRow` placeholders are absent, value cells aren't activatable,
      `DescriptionCell` is disabled — but `Duplicate` and `Expand`/`Collapse` **remain** (`nonMutating`, per
      `useRowActions`'s filter). Nothing today asserts that survivors survive.
- [ ] `BoxedEditor` pointed at a non-root `path` (the `FocusedContext` story) — CRUD inside a focused subtree, and
      that paths outside it are untouched.
- [ ] `BoxedEditor` pointed at a path that doesn't exist (`FatalError` story) — the blanket `<Alert>`, and that it
      recovers if the path later appears.
- [ ] `view-as-code` menu action fires `onOpenNode({ path, kind: 'code-editor' })` for `model`/`function`/`ruleset`/
      `optimisation`.
- [ ] Model Settings dialog: `@model-version` edits are currently dropped by the engine (already filed in
      `docs/BUG_REPORTS.md`). Assert the **known-bad** behavior with a comment naming that bug, so the test flips
      when the engine is fixed rather than silently passing forever.
- [ ] Expand/collapse: `RulesetRow` gates its children on `isExpanded`, `RelationRow` does **not** (and `relation`
      has no expand/collapse menu action at all). Assert the current behavior and file the inconsistency — one of the
      two is wrong.
- [ ] Alt-held reveals every `TypeName` tooltip at once (Resolved Decision #9) — covered by a unit test
      (`alt-reveal.test.tsx`), never in a real browser where the key handling actually matters.
- [ ] Accessibility smoke: the grid is a `treegrid`, every row action button is reachable by keyboard, and the
      three-dot menu is operable without a mouse.

### 2.6 The long business-workflow flow (new e2e spec: `e2e/boxed-editor/business-flow.spec.ts`)

One long, single `test()` (a `test.step`-segmented sequence sharing one page/model, deliberately **not** reset
between steps) simulating a rules analyst building a real model **from a completely blank starting point, using only
the editor's own "Add …" affordances** — never a pre-baked `MutableDecisionService.fromCode('{ ... a lot ... }')`
fixture. That distinction is the whole point: every other spec in this plan (§2.2–§2.5) is free to load an existing
playground story and mutate it, but this one exists specifically to prove the *construction* path end-to-end, in
narrative order, with state carried forward — which is exactly the condition under which Bugs 1, 5, 6, 10, 11, 12 and
13 actually occur. A suite of short, independent tests structurally cannot catch that class of regression, and in
fact did not: every create-path bug in Part 1 was invisible to the existing suite.

**Hard rules for this file:**
1. It loads `BlankModel` and nothing else. If a construct can't be created through the UI, that is a **finding**
   (file it in Part 1), not a reason to pre-bake it into the fixture.
2. Every step asserts cumulative state, not just its own delta — the model built so far must still link and still
   execute after each step.
3. No step may be skipped or reordered to make a later one pass. If a step is blocked, mark it `test.fixme` with the
   bug number, so the blocked surface stays visible in the report.

#### 2.6.0 The scenario: "Loan Origination & Portfolio Decisioning"

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
| `field`                             | `application.applicationDate`/`loanAmount`/`propertyValue`, plus the typed `applicant` field (Step 1). |
| `complexType`                       | `type Applicant: { name, age, income }`, reused as a field's type (Step 1) — **blocked by Bug 7**. |
| `list`                              | `requiredDocuments` — scalar string list (Step 2).                               |
| `list-item`                         | Individual document entries in `requiredDocuments` (Step 2).                      |
| `relation`                          | `collateralProperties` — one record per pledged property (Step 3).               |
| `relation-item`                     | Individual property records, at least one with a drill-down (complex-cell) column (Step 3). |
| `function`                          | `monthlyPayment` (inline), `affordabilityScore` (multi-statement), `originationFee` (no-arg), `application.loanToValue` (nested) (Step 4). |
| `function-result`                   | Synthesized `result` row of each inline function above (Step 4).                 |
| `ruleset`                           | `riskTier` decision table (Step 8).                                              |
| `rule`                              | `riskTier`'s individual rules — both cell-map and boolean-expression forms (Step 8). |
| `ruleset-default`                   | `riskTier`'s pinned fallback row (Step 8).                                       |
| `ruleset-hit-policy`                | `riskTier`'s hit-policy chip, exercised via a `first-match` → `best-match` switch (Step 8) — **blocked by Bug 8**. |
| `optimisation`                      | `portfolioMix` — this quarter's capital allocation (Step 9).                     |
| `optimisation-setting`              | `portfolioMix`'s `using` (seeded); `bottlenecks`/`timeLimit` **blocked by Bug 8** (Step 9). |
| `optimisation-variable-group`/`-variable` | One loan-count variable per risk tier from `riskTier` (Step 9).            |
| `optimisation-objective`            | Maximise expected portfolio yield (Step 9).                                     |
| `optimisation-constraint-group`/`-constraint` | Capital-adequacy and per-tier exposure limits (Step 9).                |

#### 2.6.1 The target model — the flow's definition of done

The previous revision of this plan had no stated end state, which made "did the flow work?" unanswerable. It does
now. After Step 13, the built model must be equivalent to the following (assert via `service.toPortable()` against a
structural expectation, or `mutable.getCode('*')` against normalized text — note `getCode` **requires** a path
argument; the no-arg call returns a `PortableError`):

```
{
  type Applicant: { name: <string>; age: <number>; income: <number> }

  application: {
    applicationDate: date("2026-03-01")
    loanAmount: 250000
    propertyValue: 320000
    applicant: <Applicant, required: true>
    loanToValue: func(amount: number, value: number): amount / value
  }

  requiredDocuments: ["payslip", "bank-statement", "property-valuation"]

  collateralProperties: [
    { address: { street: "Gedimino 9", city: "Vilnius" }, value: 320000, propertyType: "residential" }
    { address: { street: "Laisves 12",  city: "Kaunas"  }, value: 180000, propertyType: "commercial"  }
  ]

  monthlyPayment: func(amount: number, annualRate: number, years: number):
    amount * (annualRate / 12) / (1 - (1 + annualRate / 12) ** (-12 * years))

  affordabilityScore: func(income: number, payment: number): {
    monthlyIncome: income / 12
    ratio: payment / monthlyIncome
    result: 1 - ratio
  }

  originationFee: func(): 350

  ruleset riskTier(age: number, income: number, ltv: number): {
    hitPolicy: "first-match"
    rules: [
      { when: { age: 18..25, income: < 30000, ltv: > 0.8 }, then: { tier: "high",   maxExposure: 1000000, expectedYield: 0.11 } }
      { when: { age: 26..64, income: >= 30000 },            then: { tier: "medium", maxExposure: 5000000, expectedYield: 0.07 } }
      { when: { age: >= 65 },                               then: { tier: "low",    maxExposure: 2000000, expectedYield: 0.05 } }
    ]
    default: { tier: "declined", maxExposure: 0, expectedYield: 0 }
  }

  optimise portfolioMix(capital: number): {
    using: "highs"
    variables: {
      highTierLoans:   <number, min: 0>
      mediumTierLoans: <number, min: 0>
      lowTierLoans:    <number, min: 0>
    }
    maximise: 0.11 * highTierLoans + 0.07 * mediumTierLoans + 0.05 * lowTierLoans
    constraints: {
      capitalAdequacy: highTierLoans + mediumTierLoans + lowTierLoans <= capital
      highExposure:    highTierLoans <= 100
      mediumExposure:  mediumTierLoans <= 400
      lowExposure:     lowTierLoans <= 300
    }
  }
}
```

Exact literals may drift as the steps are written; what must not drift is the **shape** — every one of the 21 row
kinds present, and the cross-construct reference from `portfolioMix`'s objective coefficients back to `riskTier`'s
`expectedYield` outputs.

#### 2.6.2 The steps

- [ ] **Step 1 — applicant & application intake.** From a blank model: `Add field` × 3 directly on the model root
      first (to prove root-level field creation before any container exists). Then create the `application` context.
      **Note the affordance gap found while writing this plan:** `Convert to context` on a `field` *replaces* it with
      an **empty** container (`convertField` discards the value) — it does not gather the sibling fields into it. So
      the realistic sequence is: convert one field to a context, rename it `application`, then `Add field` inside it
      three times for `applicationDate` (date), `loanAmount` (number), `propertyValue` (number), and delete the two
      leftover root fields. If that reads badly to a real user, that is itself a finding worth filing.
      Separately, add a `complexType` named `Applicant` with `name`/`age`/`income` fields — **blocked on Bug 7**;
      until it lands, `test.fixme` this sub-step rather than pre-baking the type into the fixture. Then reference it
      as a typed field (`application.applicant: <Applicant, required: true>`).
- [ ] **Step 2 — required documents.** `Add list` (`requiredDocuments`) at the model root; append 3+ string items via
      the trailing "(new item)" placeholder. Assert `compatibleListItemDefault` seeds each new item as `""` (a string
      list), and that committing a number into one of them is rejected visibly (homogeneity).
- [ ] **Step 3 — collateral properties.** `Add relation` (`collateralProperties`); add its columns one at a time
      (`address`, `value`, `propertyType`), then add 2+ records. **Order matters and must be asserted:** add the
      first record while every column is still string-typed, author `value` as a number, then append the *second*
      record — that append is Bug 12's exact trigger and must now succeed. Make one record's `address` a drill-down
      complex cell (`{ street: …, city: … }`) rather than a flat string, to exercise `RelationItemRow`'s drill-down
      path, and edit a nested field inside it.
- [ ] **Step 4 — calculations, first failure.** Add the inline function `monthlyPayment`. Add its first argument
      (`amount`). **Deliberately add a second argument immediately** (Bug 1's exact trigger) and assert on the
      *fixed* behavior: two distinct arguments present, model still links, no silent no-op. Add a third
      (`years`) for good measure — the corruption compounds per-argument, so three is a stronger assertion than two.
      Then add `affordabilityScore` as a multi-statement function (2+ body fields, via `function-result`'s
      `Duplicate` — the only path there), `originationFee` with zero arguments, and a `loanToValue` function nested
      inside the `application` context.
- [ ] **Step 5 — recovery checkpoint (Bug 6/11's scenario).** Immediately after Step 4's deliberate failure, perform
      an entirely unrelated mutation — `Add relation` on the model root, distinct from `collateralProperties` — and
      assert it succeeds. This is the single most important assertion in the whole file: it directly tests "cannot
      create anything, even after the error is fixed." Then make it stronger, since Bug 11 is now understood:
      **delete a row that another row references** (e.g. delete `originationFee` after making a field reference it),
      assert the model-level error is *visible and names the offending path*, assert an unrelated `Add field` still
      commits, and finally repair the dangling reference and confirm everything links again.
- [ ] **Step 6 — deliberate parse failure and recovery.** Open `monthlyPayment`'s result expression, commit a
      syntactically invalid body (`application.loanAmount /`), assert the inline error appears **with the
      trailing-operator message** (`Expected a value after "/".`), assert every *other* row is still interactive
      (click into an unrelated field, cancel with Escape, confirm no residual edit state and no second open editor),
      then commit a valid expression and confirm the error clears and `onChange` fired exactly once.
- [ ] **Step 7 — deliberate link failure and recovery.** Delete a `monthlyPayment` argument that the body *does*
      reference; assert the rejection is visible (post-Bug-5-fix) and the signature is unchanged; then delete an
      argument that genuinely is unused and confirm that one succeeds.
- [ ] **Step 8 — risk-tiering decision table.** `Add decision table` (`riskTier`). Add condition columns
      `age`/`income`/`ltv` **and retype them to `number`** — blocked on Bugs 3/13; without that fix only string
      equality is authorable and the whole step is vacuous, so `test.fixme` rather than weaken it. Add action columns
      `tier`/`maxExposure`/`expectedYield`. Build out 3+ rules **incrementally**, asserting cumulative state after
      each add (per §2.3's style) — one rule authored as a cell-map condition, another as a boolean-expression
      condition (blocked on Bug 9). Fill in the `default` row. Switch `hitPolicy` to `best-match` and confirm the
      `priority` column appears everywhere it should, then switch back (blocked on Bug 8). Execute after each rule is
      added, so a rule that silently fails to commit is caught immediately rather than at the end.
- [ ] **Step 9 — portfolio capital allocation.** `Add optimisation` (`portfolioMix`) at the model root — **root only**,
      per `nextOptimisationRow`'s own doc comment; also assert the action is genuinely absent from a nested
      `context`'s menu (`pushContainerAdds(..., includeOptimisation=false)`), which nothing tests today. Add one
      `optimisation-variable` per `riskTier` output tier (loan count to originate this quarter), set the `maximise`
      objective to expected yield across those variables, and add capital/exposure `optimisation-constraint`s
      referencing both the variables and a value pulled from `application`/`riskTier` — this is the cross-construct
      reference: `riskTier`'s output shapes the constraint a structure built in Step 8 imposes on Step 9. Verify
      `Add Variable`'s seeded companion constraint (`E339` avoidance, per `addOptimisationVariable`'s doc comment)
      never leaves a variable unreferenced, then delete that placeholder constraint once a real one references the
      variable and confirm the model still links. Exercise `Switch to minimise`/`Switch to maximise`. `bottlenecks`
      and `timeLimit` have no create path (Bug 8) — assert their absence rather than pretending to add them.
      **Execution here requires `registerSolver`** (`requiresSolver()` is true; `highs` is not a dependency) — use
      `ExecutingHarness`'s deterministic stub.
- [ ] **Step 10 — rename under load.** Rename the `application` context (touching every downstream reference built in
      Steps 1, 4, 8, 9). **Bug 10 makes the intended assertion currently false** — the engine's `rename` migrates
      nothing, so today this breaks the whole model silently. Write the test against the *fixed* behavior (every
      dependent row's displayed expression follows the rename; the model still links and executes) and `test.fixme`
      it until Bug 10 lands; do not weaken it to assert the broken behavior, because this step is precisely the
      regression that must never come back. Also rename a nested row and a `relation` column in the same step, and
      assert the description/test-case overlays followed (`useRowCommands`'s `migrateOverlayPaths`, which no test
      touches at all today).
- [ ] **Step 11 — bulk maintenance pass.** In one continuous sequence: reorder two `riskTier` rules by drag,
      duplicate a rule, delete the duplicate, add a fourth condition column, delete a different existing column,
      rename yet another, reorder two columns, and change one column's type — i.e. the "various renames, cell value
      changes, column type changes, column reorders" the original report asked for, but chained back-to-back rather
      than in isolation, since that chaining is what the original bugs actually needed to surface. Execute once at
      the end and assert the result still matches the intent.
- [ ] **Step 12 — read-only handoff.** Re-render the same underlying service in `readOnly` mode (simulating handing
      the finished model to a reviewer) and confirm no mutation control survives the switch — **except** `Duplicate`
      and `Expand`/`Collapse`, which are explicitly `nonMutating` and must remain. Matches the existing `read-only
      story` test's intent but against the now fully-built, non-trivial model rather than a fresh one.
- [ ] **Step 13 — final execution audit.** Run the model end-to-end with 3+ distinct applicant/application input sets
      chosen to hit different branches of `riskTier` (first-rule match, later-rule match, default fallback) and
      confirm `portfolioMix` re-optimises consistently against each, asserting the `live-result` output for every run.
      Then assert the finished model against §2.6.1's target shape — the flow's definition of done.

### 2.7 Test-writing standards for all of the above

- [ ] Every new e2e test drives the **real** `@edgerules/web` engine via a Storybook story (per project policy,
      `[[Test with real engine]]`) — no network/engine mocking. The one permitted stub is `registerSolver`, because
      the LP solver is a host responsibility this package does not ship (see §2.1).
- [ ] Every "add N times" test asserts **after each addition**, not just at the end (this is the difference that
      would have caught Bug 1 immediately instead of needing a dedicated root-cause investigation).
- [ ] Every mutation test that *should* fail asserts the visible error (`role="alert"` or its post-Bug-5-fix
      equivalent) **and** that the model/DOM is otherwise unchanged — never just "no crash."
- [ ] Every mutation test that *should* succeed asserts the **model**, not only the DOM. A rolled-back
      `setWithLinkCheck` write can leave the DOM looking momentarily right; assert through `live-result` (execution)
      or a `toPortable()`-derived caption so a rollback cannot pass.
- [ ] Reuse the existing helpers in `e2e/boxed-editor/helpers.ts` (`valueCell`, `commitExpression`, `renameRow`,
      `replaceActiveExpression`, `chooseRowAction`) rather than reinventing them; extend that module — and
      `e2e/support/storybook.ts` for anything cross-component — rather than duplicating helpers into each new spec
      file. New shared helpers this plan needs: `addColumn`/`renameColumn`/`columnHeaders` (§2.4's
      `columnHelpers.ts`), `expectRowError(page, path, text)` (Bug 5's channel), `expectLiveResult(page, expected)`.
- [ ] Prefer `data-testid`-scoped locators over text matching wherever the existing convention already provides one
      (`row-${path}`, `append-${path}`), so renames elsewhere in a long flow don't break unrelated assertions.
      Column headers currently have **no** testid — add one (`column-${rowPath}-${columnName}`) as part of Bug 2's
      fix, otherwise §2.3/§2.4 have to match header text and will break on every rename test they perform.
- [ ] A step blocked on an open bug is `test.fixme(...)` with the bug number in the title — never deleted, never
      weakened to assert the broken behavior, except where an entry above explicitly says to assert current behavior
      so the fix flips a real test.

---

## Part 3 — Blocking-dependency map

Which of Part 2 can be written today, and what each blocked piece is waiting on. Write the unblocked tier first: it
is roughly half the suite and it does not need a single bug fixed.

**Tier A — writable today, no fix required**
- §2.1 `ExecutingHarness` + all four fixtures (the prerequisite for almost everything else).
- §2.2 create/duplicate/nest/delete-unreferenced-argument, plus the add-arguments-repeatedly test written to *fail*
  until Bug 1 lands (it is the regression test).
- §2.3 create-from-scratch, add columns/rules, duplicate/delete/drag rules, `default` row constraints, `any`
  conditions, execution against first/later/default.
- §2.4 record CRUD, column add/delete, drill-down editing.
- §2.5 essentially all of it — naming, empties, editing semantics, drag and drop, overlays, read-only, modes.
- §2.6 Steps 2, 3 (partly), 4 (as a Bug 1 regression), 5, 6, 7, 9 (minus settings), 12, 13 (minus the ruleset half).

**Tier B — blocked, with the gate named**
| Blocked                                          | Waiting on          |
| ------------------------------------------------ | ------------------- |
| Argument/column rename tests (§2.2, §2.3, §2.4)   | Bug 2 (+ header testids) |
| Type-matrix tests (§2.2, §2.3); Step 8 as a whole | Bugs 3 + 13         |
| Column reorder tests (§2.2, §2.3, §2.4), Step 11  | Bug 4               |
| Every "must fail visibly" assertion               | Bug 5               |
| Step 5's strengthened half                        | Bugs 6/11           |
| Step 1's `complexType` sub-step                   | Bug 7               |
| Hit-policy + priority tests, Step 8's switch, `bottlenecks`/`timeLimit` in Step 9 | Bug 8 |
| Rule-form switching (§2.3), Step 8's second rule  | Bug 9               |
| Step 10                                           | Bug 10              |
| Relation append regression (§2.4), Step 3's second record | Bug 12      |
| `collect-matches` coverage (§2.3)                 | Bug 14              |

Suggested fix order, by "tests unblocked per unit of work": **5 → 11 → 7 → 12 → 2 → 3/13 → 8 → 10 → 9 → 14 → 4.**
Bug 1 sits outside this ordering — it is a two-line defensive guard and should land first regardless.

---

## Part 4 — File & test-name tracking checklist

One flat list to check off against, so progress is trackable at a glance without re-reading Parts 1–3. "Test name" is
the literal Playwright `test('…')` (or `test.step('…')`) title to write — keep the wording when you write the test
unless a step turns up a reason to change it, and if you do rename one, update its box here in the same commit so
this list never drifts from the suite it's tracking.

### 4.1 Files to create or modify

`[x]` = done · `[ ]` = still to do. Every path below is the exact file the next agent should touch —
nothing more, nothing invented. Siblings not relevant to this plan are omitted from the tree (not deleted, just not
shown).

```
edgerules-react/
├── docs/
│   ├── boxed-editor/
│   │   └── bug-reports.md                      [x] this document
│   └── BUG_REPORTS.md                          [x] two engine defects filed: untyped `@parameters` round-trip
│                                                   (Bug 1) and `rename` not migrating references (Bug 10)
├── stories/
│   └── components/
│       └── boxed-editor/
│           └── BoxedEditor.stories.tsx          [ ] add ExecutingHarness + FunctionCrudPlayground,
│                                                    DecisionTableCrudPlayground, RelationCrudPlayground,
│                                                    BlankModel (§2.1)
├── src/
│   └── components/
│       └── boxed-editor/
│           ├── service/
│           │   ├── normalize.ts                 [ ] parametersOf: treat string 'null' as untyped (Bug 1)
│           │   ├── denormalize.ts               [ ] parameters(): same guard before re-emitting a type ref (Bug 1)
│           │   └── createBoxedEditorService.ts  [ ] setWithLinkCheck: distinguish pre-existing vs caused link
│           │                                        failure; surface model-level link errors (Bug 11)
│           ├── commands/
│           │   ├── rowFactories.ts              [ ] nextComplexTypeRow (Bug 7); type-compatible record seeding in
│           │   │                                    appendRelationItem + fix its doc comment (Bug 12); condition
│           │   │                                    column type no longer hardcoded 'string' (Bug 13)
│           │   └── useRowCommands.ts            [ ] rename: migrate references / link-check / surface error (Bug 10)
│           ├── menu/
│           │   └── actions.ts                   [ ] add rename-argument/rename-column (Bug 2), add-complex-type
│           │                                        (Bug 7), add-setting (Bug 8), switch-rule-form (Bug 9) ids
│           ├── hooks/
│           │   └── useRowActions.ts             [ ] wire rename (Bug 2) + edit-type (Bug 3) + add-complex-type
│           │                                        (Bug 7) + settings (Bug 8) + rule-form switch (Bug 9);
│           │                                        conditional `default` deletability (Bug 14); stop discarding
│           │                                        PortableError on every mutating action (Bug 5)
│           ├── rows/
│           │   ├── NewRow.tsx                   [ ] stop discarding PortableError on append (Bug 5)
│           │   ├── RuleRow.tsx                  [ ] non-destructive rule-form switching (Bug 9)
│           │   ├── RulesetHitPolicyRow.tsx      [ ] real hit-policy picker (Bug 8)
│           │   └── OptimisationSettingRow.tsx   [ ] real solver-setting picker (Bug 8)
│           ├── primitives/
│           │   ├── TypeName.tsx                 [ ] make header name/type editable in place + add a column testid
│           │   │                                    (Bugs 2, 3)
│           │   ├── DropdownChip.tsx             [ ] make it a real picker, not a decorative label (Bug 8)
│           │   └── ColumnDragHandle.tsx         [ ] wire real column drag, or replace with Move actions (Bug 4)
│           └── __tests__/
│               ├── commands.test.tsx            [ ] +5 tests — see §4.2 "Unit tests"
│               ├── normalization.test.ts        [ ] +1 test — see §4.2 "Unit tests"
│               └── mutation.test.ts             [ ] +2 tests — see §4.2 "Unit tests"
└── e2e/
    ├── support/
    │   └── storybook.ts                         [x] openStory, storyIndex, storyIdsWithPrefix
    ├── boxed-editor/
    │   ├── helpers.ts                           [x] extracted from the old flat spec
    │   │                                        [ ] + expectRowError, expectLiveResult (§2.7)
    │   ├── columnHelpers.ts                     [ ] new — shared ruleset/relation column assertions (§2.4)
    │   ├── rendering.spec.ts                    [x] split from the old flat spec — §4.2 has its 1 test
    │   ├── fields-and-lists.spec.ts             [x] split from the old flat spec — §4.2 has its 4 tests
    │   ├── functions.spec.ts                    [ ] new — §4.2 "functions.spec.ts" (16 tests)
    │   ├── decision-tables.spec.ts              [ ] new — §4.2 "decision-tables.spec.ts" (16 tests)
    │   ├── relations.spec.ts                    [ ] new — §4.2 "relations.spec.ts" (9 tests)
    │   ├── edge-cases.spec.ts                   [ ] new — §4.2 "edge-cases.spec.ts" (34 tests)
    │   └── business-flow.spec.ts                [ ] new — §4.2 "business-flow.spec.ts" (1 test, 13 steps)
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

### 4.2 Playwright test names to create

#### `e2e/boxed-editor/functions.spec.ts` — `test.describe('Boxed Editor / functions')`

- [ ] creates a function from scratch at the model root with a blank result and no arguments
- [ ] creates a function from scratch inside a nested context
- [ ] auto-names successive new functions without collision
- [ ] adds five arguments one at a time, keeping every previously added argument distinct and present
- [ ] adds two arguments in a row to a brand-new function and keeps both distinct (Bug 1 regression)
- [ ] adds two arguments in a row to a nested function and keeps both distinct (Bug 1 regression, non-root depth)
- [ ] renames each of five arguments and migrates references in the body (Bug 2 regression)
- [ ] renames a nested function's argument and migrates references in the body (Bug 2 regression, non-root depth)
- [ ] reorders arguments and keeps positional call-site order in sync (Bug 4 regression)
- [ ] changes an argument's type across number, string, boolean, date, a complex type, an array type, and a required
      annotation (Bug 3 regression)
- [ ] deletes an argument the body does not reference
- [ ] rejects deleting an argument the body does reference, with a visible error and an unchanged signature (Bug 5
      regression)
- [ ] converts an inline single-expression body into a multi-statement body
- [ ] duplicates a function with auto-renaming and independent argument/body edits
- [ ] reports a visible, path-naming error when a called function is deleted, and still accepts unrelated edits
      (Bug 11 regression)
- [ ] executes the function correctly after every structural edit in this file

#### `e2e/boxed-editor/decision-tables.spec.ts` — `test.describe('Boxed Editor / decision tables')`

- [ ] creates a decision table from scratch with the seeded hit policy and empty default row, and links immediately
- [ ] renders no condition cells on a rule added before any condition column exists
- [ ] adds condition columns one at a time, growing every existing rule's cells in lock-step
- [ ] adds action columns one at a time, growing every rule and the default row's cells in lock-step
- [ ] renames a condition column and migrates every rule's `when` key together with the header (Bug 2 regression)
- [ ] renames an action column and migrates every rule's and the default row's `then` key with the header (Bug 2
      regression)
- [ ] changes a condition column's type across a numeric range, a comparison, an equality, a date, and a string/enum
      column (Bugs 3/13 regression)
- [ ] rejects a column retype that invalidates existing cells, leaving every cell unchanged
- [ ] reorders columns and keeps rule cells aligned with the reordered header (Bug 4 regression)
- [ ] adds, duplicates, and deletes a rule
- [ ] reorders rules by drag and changes first-match evaluation order accordingly
- [ ] switches a rule from cell-map form to boolean-expression form and back (Bug 9 regression)
- [ ] treats a blank condition cell as "any" and omits the key from the committed model
- [ ] edits the pinned default row's actions and confirms it cannot be deleted or duplicated
- [ ] switches hit policy across first-match, best-match, unique-match and collect-matches, showing the priority
      column only under best-match (Bugs 8/14 regression)
- [ ] executes the table against inputs that hit the first rule, a later rule, the default fallback, a unique-match
      violation, and a priority tie under best-match

#### `e2e/boxed-editor/relations.spec.ts` — `test.describe('Boxed Editor / relations')`

- [ ] adds columns one at a time, growing every existing record's cells in lock-step
- [ ] renames a column and migrates every record's cell key together with the header (Bug 2 regression)
- [ ] deletes a column and confirms every record's cell for that column is removed with it
- [ ] appends a record to a relation with a numeric column and commits it (Bug 12 regression)
- [ ] re-authors a column's cell values across the type matrix (number → string → boolean) and confirms the engine's
      homogeneous-array constraint is enforced consistently across every record
- [ ] reorders columns and keeps record cells aligned with the reordered header (Bug 4 regression)
- [ ] adds, duplicates, and deletes a record
- [ ] drills down into a record's complex-object cell and edits a nested field there
- [ ] reorders records by drag and reflects the new order in execution output

#### `e2e/boxed-editor/edge-cases.spec.ts` — `test.describe('Boxed Editor / edge cases')`

Naming
- [ ] rejects renaming a row to a name a sibling already uses
- [ ] handles a cleared name consistently across row kinds
- [ ] rejects names that are not valid DSL identifiers
- [ ] auto-names without collision after an intermediate row is deleted
- [ ] migrates references when a referenced row is renamed (Bug 10 regression)

Empty and boundary states
- [ ] creates and executes an empty list
- [ ] creates and executes an empty relation, and one with columns but no records
- [ ] deletes the last item of every container kind and keeps the model linkable
- [ ] deletes a context's only child and then the context itself
- [ ] enforces list homogeneity when appending and when committing a mismatched literal
- [ ] renders very long names and expressions without horizontal overflow
- [ ] stays responsive when editing the last row of the 200-row large model

Editing semantics
- [ ] keeps at most one expression cell active at a time
- [ ] cancels an edit with Escape and restores the previous value
- [ ] activates a focused static cell with Enter and with F2
- [ ] requires a value when a plain field's cell is cleared
- [ ] keeps an active cell's draft across an unrelated row's mutation
- [ ] reports a trailing-operator parse error with the specific message and clears it on a valid commit
- [ ] fires onChange exactly once per successful commit and never on a rejected one

Drag and drop
- [ ] reorders rows within a container for every movable kind
- [ ] reparents a row across containers where the drop matrix allows it
- [ ] shows a rejecting outline and changes nothing for an invalid drop
- [ ] appends by dropping onto a trailing placeholder
- [ ] offers no drag handle for a non-movable kind
- [ ] refuses a list-item drop whose literal kind does not match

Overlays and side panels
- [ ] migrates a row's description when the row is renamed
- [ ] migrates a nested row's description when an ancestor is renamed
- [ ] migrates test-case cells across a rename and across a drag-move
- [ ] renders passing and failing test results per row and coalesces a burst of edits into one run
- [ ] omits the description and test-result columns entirely when disabled

Modes
- [ ] hides every mutating affordance in read-only mode but keeps Duplicate and Expand/Collapse
- [ ] edits inside a focused subtree without touching paths outside it
- [ ] shows the fatal-path alert and recovers when the path appears
- [ ] fires onOpenNode for the view-as-code action on every construct that offers it
- [ ] documents the known-bad model-version behavior until the engine metadata bug is fixed
- [ ] reveals every type tooltip while Alt is held
- [ ] exposes the grid as a treegrid and drives the row-actions menu by keyboard

#### `e2e/boxed-editor/business-flow.spec.ts` — `test.describe('Boxed Editor / business flow')`

- [ ] builds a loan origination and portfolio decisioning model from a blank start, surviving parse/link/argument
      failures along the way (one long test; each bullet below is that test's `test.step`)
  - [ ] Step 1 — applicant & application intake
  - [ ] Step 2 — required documents list
  - [ ] Step 3 — collateral properties relation
  - [ ] Step 4 — calculations, first failure (duplicate-argument regression)
  - [ ] Step 5 — recovery checkpoint: unrelated mutations still succeed after a rejected commit and after a dangling
        reference (Bugs 6/11 regression)
  - [ ] Step 6 — deliberate parse failure and recovery
  - [ ] Step 7 — deliberate link failure and recovery
  - [ ] Step 8 — risk-tiering decision table
  - [ ] Step 9 — portfolio capital allocation optimisation
  - [ ] Step 10 — rename under load
  - [ ] Step 11 — bulk maintenance pass
  - [ ] Step 12 — read-only handoff
  - [ ] Step 13 — final execution audit against the target model

#### Unit tests (vitest, real `@edgerules/node` engine, no mocks)

**`src/components/boxed-editor/__tests__/commands.test.tsx`:**

- [ ] Add Argument appends two distinct, uniquely-named untyped parameters when clicked twice in a row on a
      brand-new function (Bug 1 regression)
- [ ] Add Argument appends two distinct, uniquely-named untyped parameters when clicked twice in a row on a function
      nested inside a context (Bug 1 regression, non-root depth)
- [ ] Add complex type creates a linkable `type X: { … }` at the model root and inside a context (Bug 7 regression)
- [ ] appending a record to a relation with a numeric column commits a type-compatible blank record (Bug 12
      regression)
- [ ] a rejected menu action surfaces its PortableError instead of silently no-opping (Bug 5 regression)

**`src/components/boxed-editor/__tests__/normalization.test.ts`:**

- [ ] a parameter whose portable value round-trips as the string `'null'` normalizes to an untyped parameter, not a
      type reference (Bug 1 regression)

**`src/components/boxed-editor/__tests__/mutation.test.ts`:**

- [ ] an unrelated write still commits after a removal left another row's reference dangling (Bug 11 regression)
- [ ] renaming a referenced row migrates its references, or is rejected with a visible error (Bug 10 regression)

#### Existing files — no new test names, tracked here only so this checklist is complete

- [x] `e2e/boxed-editor/rendering.spec.ts` — every current Boxed Editor story renders from the Storybook index
- [x] `e2e/boxed-editor/fields-and-lists.spec.ts` — 4 tests (creates/completes fields; reports invalid values; creates
      a list; read-only story)
