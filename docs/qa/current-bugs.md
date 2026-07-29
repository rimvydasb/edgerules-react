# Current Bugs

Every confirmed defect in the Boxed Editor, with a repro, a root cause, a fix location and the phase that owns it.
Read [`qa-general-info.md`](qa-general-info.md) first.

**Verification:** entries marked *verified* were reproduced against `@edgerules/node` / `@edgerules/web`
**`0.0.5-alpha.202607291250`** on **2026-07-29**, with throwaway Node scripts — no React, no mocks. Entries marked
*by inspection* were root-caused from the source only. Re-run the verified repros after any engine upgrade before
touching the fixes.

**Every regression test named below is a Playwright browser test** unless explicitly marked otherwise. A pure-function
Vitest test may accompany one, never replace it.

## Index

| #  | Title                                                                     | Severity | Layer  | Fixed in                                   |
| -- | ------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------ |
| 1  | Untyped argument corrupts on round-trip                                   | Critical | engine | [Phase 2](improvement-phase-2.md)          |
| 2  | No rename for an argument / column                                        | High     | react  | [Phase 4](improvement-phase-4.md)          |
| 3  | No way to change a column/argument type                                   | High     | react  | [Phase 4](improvement-phase-4.md)          |
| 4  | Column drag handles are decorative                                        | Medium   | react  | [Phase 4](improvement-phase-4.md)          |
| 5  | Errors from menu-driven Add/Delete are swallowed                          | High     | react  | [Phase 2](improvement-phase-2.md)          |
| 6  | "Cannot create anything, even after the error is fixed"                   | Critical | react  | [Phase 2](improvement-phase-2.md) (= Bug 11) |
| 7  | A `complexType` can never be created from the UI                          | High     | react  | [Phase 3](improvement-phase-3.md)          |
| 8  | `DropdownChip` settings are decorative — hit policy unchangeable          | High     | react  | [Phase 5](improvement-phase-5.md)          |
| 9  | A rule can never be authored in boolean-expression form                   | Medium   | react  | [Phase 5](improvement-phase-5.md)          |
| 10 | `rename` never migrates references — silently breaks the model            | Critical | both   | [Phase 6](improvement-phase-6.md)          |
| 11 | The link check is model-global, so one broken row freezes every commit    | Critical | react  | [Phase 2](improvement-phase-2.md)          |
| 12 | Appending a record to a non-string-column relation silently does nothing  | High     | react  | [Phase 3](improvement-phase-3.md)          |
| 13 | New condition columns are hardcoded `string`                              | High     | react  | [Phase 4](improvement-phase-4.md)          |
| 14 | `collect-matches` rulesets are unreachable                                | Medium   | react  | [Phase 5](improvement-phase-5.md)          |

---

## Bug 1 — Untyped function/optimisation argument corrupts on round-trip

**Severity: Critical.** Root cause behind both `Strange null error` and `Impossible to create more than one function
argument` from the original report — the same defect observed at two different moments.

- [x] Root-caused (verified against the real engine)
- [x] Filed upstream in `docs/BUG_REPORTS.md`
- [ ] Defensive workaround shipped in edgerules-react
- [ ] Browser regression test added

**Root cause.** `EDGERULES_API_SPEC.md` §"Function Definition" documents a `@parameters` value as a bare type string,
a `PortableTypedValue`, or **`null` for an untyped parameter**. `rowFactories.addArgument` and `denormalize.ts`'s
`parameters()` both follow that contract. The engine does not round-trip it:

```ts
const mutable = MutableDecisionService.fromCode('{ func f(): "" }');
mutable.set('f', {
  '@kind': 'function',
  '@parameters': { arg: null },
  '@body': { '@kind': 'expression', expression: '""' },
});
// set() returns a correct schema: { '@kind': 'function-schema', '@parameters': { arg: 'any' }, … }  ✅
mutable.toPortable().f['@parameters'];   // { arg: 'null' }  ❌ should be { arg: null }

// The second "Add argument" — i.e. a whole-row commit built from what toPortable() just returned:
mutable.set('f', { '@kind': 'function', '@parameters': { arg: 'null', arg2: null }, '@body': { … } });  // succeeds
mutable.link();
// throws: linker error: E102: unknown type 'null' in node NodeId(3) — not a built-in type
//         and no visible 'type null: …' definition
```

Note the asymmetry that makes this hard to spot: `set()` succeeds and its own return value is correct; only
`toPortable()` — the editor's only read path — is wrong, and only the *next* write actually fails.

`normalize.ts`'s `parametersOf` reads `'null'` back as `{ name: 'arg', type: 'null' }` (a truthy string, so it takes
the "has a type" branch, line 45). `denormalize.ts`'s `parameters()` then re-emits that string as a **real type-name
reference** via its `else if (parameter.required === undefined)` branch. `setWithLinkCheck` catches the E102 and rolls
back to the already-corrupted single-argument state, and `useRowActions`'s `add-argument` handler discards the error
(Bug 5). From the user's chair: click "Add argument" a second time and **nothing happens**. The error only surfaces
later, when some unrelated edit re-triggers a whole-row commit on the same function — which is why the original report
blamed "setting string as return type".

**Fix (edgerules-react, defensive — no engine upgrade required).** Treat the string `'null'` as equivalent to JSON
`null` on both sides of the boundary:
- `service/normalize.ts` → `parametersOf`: `if (parameter === null || parameter === 'null') return { name };`
- `service/denormalize.ts` → `parameters()`: same guard before the `else if (parameter.required === undefined)`
  branch, so a parameter typed exactly `'null'` denormalizes back to JSON `null`.

Comment both with the engine version they work around so the upgrade skill can delete them. Accepted side effect: a
user-defined type literally named `null` becomes unreferenceable. That is fine.

**Regression tests.** Browser: add two arguments in a row to a brand-new function (root and nested) and assert both
persist and the model still executes. Optional pure-function supplement: `parametersOf('null')` yields an untyped
parameter.

---

## Bug 2 — No way to rename a function argument or a decision-table column

**Severity: High.** *(by inspection)*

- [x] Root-caused
- [ ] Rename affordance designed and implemented
- [ ] Browser regression test added

**Root cause.** Purely missing UI, not an engine gap. `ArgumentHeaders.tsx`, `RulesetRow.tsx`'s
`RulesetColumnHeaders` and `RelationRow.tsx`'s `RelationColumnHeaders` all render column names through `TypeName` — a
read-only `Box component="span"` inside a `Tooltip`, with no click handler and no text field. `menu/actions.ts`'s
`rowActionRegistry` has no `rename-argument`/`rename-column` id, and `useRowActions.ts` offers only `Add …` and
`Delete "<name>" …` for those kinds. The only way to rename a column today is delete-and-recreate, which loses every
rule/record cell authored against it.

**Fix.** Add a rename affordance (a `rename-column`/`rename-argument` menu action, or a clickable header like
`NameCell`) that renames **in place**:
- `function`/`optimisation` argument → rewrite `parameters[i].name` and every reference in the body/rules.
- `ruleset` condition/action column → rewrite `parameters`/`actionColumns` **and** the matching key in every `rule`'s
  `when`/`then` *and* the `ruleset-default`'s `then`.
- `relation` column → rewrite `columns` and every record's cell key.

**Reference migration is the editor's job** — see Bug 10: `MutableDecisionService.rename` migrates nothing. Commit the
whole migration as a **single** `setBoxedRowData` so `setWithLinkCheck` accepts or rejects it atomically.

Ship a `data-testid="column-${rowPath}-${columnName}"` on every header at the same time — without it, every column
test has to match header text and will break on the very rename tests it is trying to perform.

---

## Bug 3 — No way to change a column/argument's type after creation

**Severity: High.** Elevated from "inconvenience": combined with Bug 13 it makes a numeric decision table impossible
to build at all. *(by inspection)*

- [x] Root-caused
- [ ] Fix designed and implemented
- [ ] Browser regression test added

**Root cause.** Same as Bug 2 — `TypeName` is read-only. `addConditionColumn` hardcodes `'string'`
(`rowFactories.ts:423`); `useRowActions`'s `optimisation` branch hardcodes `'number'`; nothing can change either
afterwards. A function argument's type can only be set indirectly, once.

**Scope — which constructs actually have a header-level type to edit:**

| Construct                   | Has an editable type?                                                        |
| --------------------------- | ---------------------------------------------------------------------------- |
| `function`/`optimisation` argument | Yes — `parameters[i].type` and `.required`.                            |
| `ruleset` **condition** column | Yes — `parameters[i].type`, required by the engine (`E301`).               |
| `ruleset` **action** column   | **No** — pure output shape, inferred from the authored `then` literals.     |
| `relation` column             | **No** — inferred from the records' cell literals, constrained to be identical across records (Bug 12). |

Tests must not expect a type control where there is nothing to type.

**Fix.** Pair with Bug 2's rename UI — an editable header (name + type), or a dedicated "Edit type" action per
argument/condition column, writing through the whole-row `setBoxedRowData` path so the link check gates it. Retyping
a column must re-validate every cell in that column in the **same commit**: a `string` column holding `"retail"`
retyped to `number` must fail as one atomic rejection, never leave half a table committed.

---

## Bug 4 — Column/argument drag handles are decorative

**Severity: Medium.** *(by inspection)*

- [x] Root-caused
- [ ] Implemented, **or** feature explicitly descoped and the handle removed
- [ ] Browser regression test added

**Root cause.** `primitives/ColumnDragHandle.tsx` renders a `DragIndicatorIcon` with `cursor: 'grab'` and **no**
`draggable`, `onMouseDown` or `@dnd-kit` wiring. Row-level reordering *is* fully wired (`dnd/useRowDrag.ts`,
`useRowDrop.ts`, `dropRules.ts`, consumed by `BoxedEditorGrid`'s `DndContext`); column reorder has no equivalent hook.
Every consumer (`ArgumentHeaders`, `RulesetRow`, `RelationRow`) is affected identically. It is a pure false
affordance: it invites a drag that does nothing.

**Decide this before implementing.** For a `function`/`optimisation`, argument order **is** the positional call-site
order, so reordering changes the meaning of every existing call — the fix must either rewrite call sites or refuse
the reorder. For a `ruleset`/`relation`, column order is presentational only (`when`/`then` and record cells are
name-keyed), so a reorder is safe. The e2e assertions differ accordingly.

**Fix.** Either wire real column drag-and-drop (reorder `parameters`/`actionColumns`/`columns` and rewrite every
dependent row's cell order, mirroring `move()`'s whole-parent rewrite), or remove the handle and ship explicit
"Move left"/"Move right" menu actions.

---

## Bug 5 — Errors from container-level "Add …" / "Delete …" actions are swallowed

**Severity: High.** This is what makes Bugs 1, 11, 12 and 13 look like "nothing happens" instead of a visible,
actionable error. Worth fixing independently of all of them. *(by inspection)*

- [x] Root-caused
- [ ] Fix designed and implemented
- [ ] Browser regression test added

**Root cause.** Every `onSelect` handler in `useRowActions.ts` calls `commands.setBoxedRowData(...)` (or
`commands.remove(...)`) and **discards the returned `PortableError`** — e.g. `add-argument`:
`commands.setBoxedRowData(row.path, addArgument(table))`, no assignment, no check, no feedback. `NewRow.tsx`'s
`onActivate` handlers (`appendListItem`/`appendRelationItem`/`appendRule`/`appendOptimisation*`) do the same.

Contrast `ExpressionCell`'s value-cell commit, which keeps the error and renders it inline (`role="alert"`). A user
driving the three-dot menu or the "(new …)" placeholder has **no way to learn the action failed** — the row silently
does not change, with nothing in the DOM to assert against either.

**Fix.** Surface the `PortableError` from every mutating menu action *and* every `NewRow` append the same way a
value-cell commit does — a shared alert channel keyed by the acting row's path, with a stable `role="alert"` and
`data-testid="row-error-${path}"` so tests can assert *which* row failed.

---

## Bug 6 — "Cannot create anything, even after the underlying error is fixed"

**Severity: Critical.** **Root-caused: it is Bug 11.** *(verified)*

- [x] Reproduced with a minimal written-down script
- [x] Root-caused
- [ ] Fixed (tracked as Bug 11)
- [ ] Browser regression test added (tracked as Bug 11)

The report's wording implied a global, not row-scoped, latch. There is one, and it is not React state: it is
`setWithLinkCheck` calling `mutable.link()`, which validates the **whole model**, combined with
`remove`/`rename`/`move` deliberately *not* link-checking (Resolved Decision #12). Full mechanism, repro and fix in
Bug 11. This entry stays only as the user-facing symptom; do not investigate it separately.

The recovery path exists — repairing the dangling reference re-links the model and unblocks every subsequent commit
(verified) — but it is undiscoverable: nothing says which row is broken, and Bug 5 means the failing commits say
nothing at all.

---

## Bug 7 — A `complexType` can never be created from the UI

**Severity: High.** Leaves one of the 21 row kinds unreachable. *(by inspection; engine support verified)*

- [x] Root-caused
- [ ] Fix designed and implemented
- [ ] Browser regression test added

**Root cause.** The editor renders, normalizes, denormalizes, duplicates, deletes and adds fields to a `complexType`
row — but nothing creates one:
- `menu/actions.ts` has no `add-complex-type` id.
- `useRowActions.ts`'s `pushContainerAdds` offers exactly `add-field`, `add-function`, `add-optimisation` (root only),
  `add-ruleset`, `add-relation`, `add-list`.
- `commands/rowFactories.ts` has a `rowFactories.complexType` entry but **no `nextComplexTypeRow`**, unlike every
  other kind (`nextFieldRow`, `nextFunctionRow`, `nextRulesetRow`, `nextRelationRow`, `nextListRow`,
  `nextOptimisationRow`).
- `NewRow.tsx`'s `NEW_ROW_CONFIG` maps `model`/`context` to `itemKind: 'field'`.
- The `field` row's `Convert to …` actions offer `context`/`relation`/`list` only.

So a `complexType` is reachable **only** by loading a model that already declares one.

**Engine support verified** — this is purely a missing UI action:

```ts
const m = MutableDecisionService.fromCode('{ x: 1 }');
m.set('Applicant', { '@kind': 'type-definition', name: 'string', age: 'number' });
m.link();                   // OK
m.toPortable().Applicant;   // { '@kind': 'type-definition', name: 'string', age: 'number' }
```

**Fix.** Add an `add-complex-type` action id + icon, a `nextComplexTypeRow(container, existingNames)` factory (seed
one `string` member — check an empty `type X: {}` against the linker before choosing that as the default), and push
it from `pushContainerAdds` for both `model` and `context`. Then verify the second half of the story: a field can
actually *reference* the new type (`application.applicant: <Applicant, required: true>`), which today is only
reachable by hand-typing the annotation into a value cell.

---

## Bug 8 — `DropdownChip` settings are decorative: hit policy and solver settings cannot be changed

**Severity: High.** Same false-affordance class as Bug 4, on a far more important control. *(by inspection; accepted
hit-policy set verified)*

- [x] Root-caused
- [ ] Fix designed and implemented
- [ ] Browser regression test added

**Root cause.** `primitives/DropdownChip.tsx` renders a label plus an `ArrowDropDownIcon` and **nothing else** — no
`onClick`, no `Menu`, no options, no `role`. Its own doc comment says it "opens a dropdown in the real editor"; that
never landed. Both consumers are affected:
- `RulesetHitPolicyRow.tsx` — `hitPolicy` is display-only. `first-match` can never become anything else.
- `OptimisationSettingRow.tsx` — `using` (and `bottlenecks`) is display-only; only `timeLimit` gets a real
  `ExpressionCell`.

Knock-on effects:
- `RulesetRow`'s `showPriority` is driven by `hitPolicy === 'best-match'`, so the **entire priority column** — header,
  every `RuleRow` cell, `commitPriority`'s validation — is unreachable from the UI.
- `nextOptimisationRow` seeds only `using`. `bottlenecks` and `timeLimit` have **no create path at all** (no menu
  action, no `NewRow` config for `optimisation`).

**Engine-accepted hit policies, verified:** `first-match` ✅, `best-match` ✅, `unique-match` ✅, `collect-matches` ✅
(but see Bug 14). Anything else is `E302`.

**Fix.** Make `DropdownChip` a real picker (`MenuItem` list, `role="button"` + `aria-haspopup`), driven by a
per-consumer options list, committing through `setBoxedRowData` on the owning row so the link check gates it.
Separately add `bottlenecks`/`timeLimit` to the `optimisation` row's menu as `Add setting` items — they are name-keyed
children of the `optimise` declaration, so an append is an ordinary owner-coalesced write.

---

## Bug 9 — A rule can never be authored in boolean-expression form

**Severity: Medium** (High for the business flow, which needs both forms in one table). *(by inspection)*

- [x] Root-caused
- [ ] Fix designed and implemented
- [ ] Browser regression test added

**Root cause.** `RuleRow.tsx`'s `RuleCells` branches on `hasExpression = row.conditionsExpression !== undefined`:
- When `undefined` — which is every rule `appendRule` creates, since it seeds `conditions: conditionColumns.map(() =>
  '')` and never sets `conditionsExpression` — the cell-map UI renders and `commitConditionsExpression` is
  **unreachable**.
- When set — only possible by loading a model that already authored `when:` as a boolean expression — the single
  expression cell renders, and the per-column cells are not rendered at all.
- The one available transition is destructive and one-way: `commitConditionCell` sets `conditionsExpression:
  undefined`, so an expression-form rule silently becomes cell-map on the first column-cell edit, with no way back.

**Also:** on a ruleset with **zero** condition columns (what `Add decision table` creates), `conditionColumns` is
empty, so a freshly created rule renders no condition cells at all — there is literally nothing to click until a
condition column is added first.

**Fix.** A per-rule toggle (menu action `Switch to expression condition` / `Switch to column conditions`, or a chip in
the conditions header) flipping `conditionsExpression` between `undefined` and a seeded value, in a single whole-`rule`
commit. Going expression → cell-map must warn or clear rather than silently drop the authored expression: the two
representations are not mechanically convertible.

---

## Bug 10 — `rename` never migrates references, silently breaking the whole model

**Severity: Critical.** *(verified)*

- [x] Reproduced against the real engine
- [x] Filed upstream in `docs/BUG_REPORTS.md`
- [ ] Decided where the fix belongs (engine vs editor)
- [ ] Fixed
- [ ] Browser regression test added

**Repro (no React):**

```ts
const m = MutableDecisionService.fromCode('{ application: { loanAmount: 1000 } total: application.loanAmount * 2 }');
m.rename('application', 'app');   // returns undefined = success
m.link();
// throws: linker error: E102: unresolved reference 'application.loanAmount' in node NodeId(3)
```

The same holds one level down — renaming `ctx.a` in `{ ctx: { a: 1  b: a + 1 } }` leaves `b`'s `a + 1` dangling — so
it is not a root-only special case. `toPortable()` confirms the referring expression is left byte-identical.

**Why the editor makes it worse.** `useRowCommands.rename` calls `service.rename` and returns `undefined` on success;
`createBoxedEditorService`'s `rename` performs **no** link check by design (Resolved Decision #12 — those operations
"may legitimately leave a *different* row's reference dangling, and rolling them back would make renaming/removing
anything another row still refers to impossible"). Defensible in isolation; combined with Bug 11 it means one
innocuous rename can put the model into a state where **no further edit anywhere commits**, with no error at any
point. `NameCell`-driven renames (every named row) and any future column rename (Bug 2) are both affected.

**Fix — pick one and write it down:**
1. **Engine (preferred).** `rename` rewrites every reference to the renamed path. Filed upstream; check
   `../edgerules-v2/tests/wasm/crud.test.ts` for the intended contract first.
2. **Editor.** Scan the portable tree for references to the old path, rewrite them, and commit rename + rewrites as
   one operation, rolling back if the result does not link. Substantial, and duplicates the engine's name resolution.
3. **Minimum viable, ship regardless of 1/2.** Make `rename` link-check like `setBoxedRowData` does, and surface the
   error through Bug 5's channel instead of silently corrupting the model. Whether it rolls back or merely warns is
   the Resolved-Decision-#12 trade-off to revisit — but "succeeds silently and freezes the editor" is not an option.

---

## Bug 11 — The link check is model-global, so one dangling reference freezes every subsequent commit

**Severity: Critical.** Bug 6's actual root cause. *(verified)*

- [x] Reproduced against the real engine
- [ ] Fix designed and implemented
- [ ] Browser regression test added

**Mechanism.** `setWithLinkCheck` (`createBoxedEditorService.ts:445`) runs `mutable.link()` after every
`setBoxedRowData` and rolls the write back if it throws. `link()` validates the **entire model**, not the written
subtree. Meanwhile `remove`, `rename` and `move` skip the check entirely by design. So any `remove`/`rename`/`move`
that leaves a dangling reference makes the model globally unlinkable — and from that moment every `setBoxedRowData`
**anywhere** fails its link check and is rolled back, however unrelated.

```ts
const m = MutableDecisionService.fromCode('{ application: { loanAmount: 1000 } total: application.loanAmount * 2 }');
m.remove('application');   // succeeds, no error, no link check
m.link();                  // E102: unresolved reference 'application.loanAmount'
m.set('unrelated', 42);    // the write itself succeeds …
m.link();                  // … but the model still doesn't link, so setWithLinkCheck rolls it back
// → in the editor: "Add field" on the model root does nothing, forever, with no error (Bug 5)
```

**Recovery works, but is undiscoverable** (also verified):

```ts
m.set('total', { '@kind': 'expression', expression: '0' });  // commits: the model links again
m.link();                                                    // OK
m.set('newField', 7);                                        // OK from here on
```

So the report's "you cannot add anything even error is fixed" is precise about the symptom and slightly off about the
cause: the fix *does* help; nothing tells you **which** row needs fixing, and every other attempt silently no-ops
until you happen to fix it.

**Fix — all three, they are complementary:**
1. **Surface it.** When `setWithLinkCheck` rolls back with a link error whose `path` is *not* the row being written,
   report it as a model-level problem naming the offending path — a persistent banner ("`total` refers to
   `application.loanAmount`, which no longer exists"), not a transient per-cell alert. This alone converts an
   unusable editor into a merely annoying one.
2. **Distinguish the two failure modes.** A link error caused by the current write should reject that write (today's
   behaviour, correct). A link error already present *before* the write should not block it — snapshot linkability
   before the `set` and only roll back when the write made things worse.
3. **Stop creating the state.** Bug 10's fix, plus a pre-flight on `remove` ("`x` is still referenced by `y` — delete
   anyway?").

---

## Bug 12 — Appending a record to a relation with any non-`string` column silently does nothing

**Severity: High.** *(verified)*

- [x] Reproduced against the real engine
- [ ] Fix designed and implemented
- [ ] Browser regression test added

**Root cause.** `appendRelationItem` seeds every cell with `BLANK_LITERAL` (`""`). EdgeRules arrays are homogeneous by
structural type, so an all-empty-strings record does not match existing records with numeric/boolean/date columns —
`link()` rejects it and `setWithLinkCheck` rolls the append back. With Bug 5 (`NewRow` discards the error), clicking
"(new row)" on any realistic relation is a **silent no-op**.

```ts
// existing: [ { name: "a", value: 1 } ] — append a blank record:
m.set('rel', [ …existing, { '@kind': 'context', name: {…'""'}, value: {…'""'} } ]);   // set() succeeds
m.link();
// throws: type mismatch in node NodeId(3): expected {name: string; value: number},
//                                          found    {name: string; value: string}
```

`appendRelationItem`'s own doc comment claims "a non-`string`-typed column still needs the user's first real edit
before it round-trips" — that is **wrong** and must be corrected with the fix: the user never gets to make that first
edit, because the append never commits.

**Fix.** Seed each cell from the **previous record's** literal for that column, coerced to a blank-but-type-compatible
default the way `compatibleListItemDefault` already does for lists (`0` numeric, `false` boolean, `""` string,
previous literal otherwise). Extract that helper and share it. Where no previous record exists, `""` stays correct.
`addRelationColumn` backfills `BLANK_LITERAL` too — safe only because a brand-new column has no prior type to
conflict with; note that in a comment so the asymmetry is deliberate.

---

## Bug 13 — New condition columns are hardcoded `string`, so no numeric decision table is buildable

**Severity: High.** A consequence of Bug 3, called out separately because it is a *hard blocker*, not a missing
convenience. *(by inspection; consequence verified)*

- [x] Root-caused
- [ ] Fix designed and implemented (ships with Bug 3)
- [ ] Browser regression test added

`addConditionColumn` writes `{ name: columnName, type: 'string' }`. Every realistic decision table's conditions are
ranges and comparisons on numbers or dates (`age: 18..25`, `income: < 30000`,
`applicationDate: >= date("2026-01-01")`). Against a `string` column those are rejected:

```
linker error: type mismatch in node NodeId(3): expected string, found number
```

…which, via Bug 5, surfaces as the rule cell edit "just not sticking". So today the only buildable-from-scratch
decision table is one whose every condition is a string equality. Bug 3's fix must land before the type matrix and the
business flow's decision-table step can be written at all — and it should reconsider the default: a type picker shown
at column-creation time beats any hardcoded default.

---

## Bug 14 — `collect-matches` rulesets are unreachable from the editor

**Severity: Medium.** *(verified)*

- [x] Reproduced against the real engine
- [ ] Fix designed and implemented
- [ ] Browser regression test added

`nextRulesetRow` always seeds a `ruleset-default` child, deliberately (a ruleset with neither rules nor a default
cannot infer its result type, `E308`). `normalizeRuleset` marks that row `deletable: false`, and `useRowActions`'s
`ruleset-default` branch offers `Delete` only as a `deletable`-disabled no-op. But the engine **rejects** a `default`
under `collect-matches`:

```
linker error: E306: ruleset 'r' has a 'default' under hitPolicy "collect-matches"
```

So even once Bug 8 makes the hit-policy chip real, `collect-matches` can never be selected: the mandatory `default`
makes it unlinkable, and there is no way to remove the default. `first-match`, `best-match` and `unique-match` all
accept a default and are fine.

**Fix.** Make `default`'s `deletable` conditional on the current hit policy, and have the hit-policy picker drop the
`default` row in the same commit when switching to `collect-matches` (re-seeding it when switching away). Either way
the two settings must be committed together — they are not independently valid.
