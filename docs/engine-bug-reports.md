# EdgeRules Engine Bug Reports

Each entry has a label:

- **[VALID]** — the defect is still open and reproduces on the version named in the entry.
- **[NOT A BUG]** — the behaviour is by design. The entry stays so that nobody files it again.

Delete a [VALID] entry when the engine fixes it.

All entries were last re-verified against `@edgerules/node` and `@edgerules/web` **`0.1.0-alpha.202610281745`** on
**2026-10-28** with throwaway Node scripts — no React, no mocks.

Entry format: a heading with the label and the problem name, then **What is wrong**, then **Expected behaviour** (for
[VALID]) or **Why it is not a bug** (for [NOT A BUG]).

## [VALID] Empty zero-column relations round-trip as lists

**What is wrong:** an empty relation has no record keys from which the engine can infer relation columns. After a
mutable write, `[]` normalizes as a scalar list, not as a relation. A UI can keep a relation with zero records when it
knows at least one column, but it cannot carry the "zero columns, zero records" state across the portable engine
boundary.

```ts
const s = MutableDecisionService.fromCode('{ r: [{a: 1}] }');
s.set('r', []);
s.toPortable();
// { '@kind': 'context', r: { '@kind': 'expression', expression: '[]' } }  — no relation kind
```

Phase 10's exact empty-relation browser case is marked **CANNOT COMPLETE**. Workaround: the editor seeds one empty
record when it creates a zero-column relation.

**Expected behaviour:** portable data has an unambiguous empty-relation representation, or engine metadata keeps the
intended collection kind when no values exist.

## [VALID] Root `set('*', …)` drops root metadata (`@model-name`, `@model-version`)

> KNOWN ISSUE. IGNORE IT. This issue is well known and will be revisited in future stories.

**What is wrong:** `MutableDecisionService.fromPortable({'@model-version': '1.4.0', ...})` keeps `@model-version`
(`API_SPEC.md` "Limitations" #3: only `@model-version` round-trips; `@model-name` is accepted on parse but not
persisted). A root `set('*', …)` on a service that already exists drops **both** keys. The rest of the write commits. So
a mutable service can set `@model-version` at construction, but it can never change it or set it later.

```ts
const service = MutableDecisionService.fromCode('{ amount: 10 }');
service.set('*', {...service.toPortable(), '@model-version': '2.0'});
service.toPortable();
// { '@kind': 'context', amount: 10 }  — '@model-version' is missing; 'amount' did commit
```

`BoxedEditor`'s `Model Settings` dialog (`docs/boxed-editor/phase-05-context-menus-and-actions.md` §4) commits through
this `set('*', …)` path. Neither field that it edits persists after the next reload. The dialog is implemented as
specified, but this engine gap blocks it end-to-end.

**Expected behaviour:** a root `set('*', …)` persists `@model-version` exactly as `fromPortable` does. For
`@model-name`, it persists the key or rejects the write (the sibling gap in `API_SPEC.md`).

## [VALID] Built-in function signatures are only available as lossy completion `detail` strings

**What is wrong:** the only API that lists built-in functions is the static
`MutableDecisionService.completions(code, pos)`. Options with `type: 'function'` carry the signature as a free-text
`detail` string. There is no structured built-in catalog. The `detail` string loses information that a GUI needs:

1. **No parameter names.** `round | (number, number) -> number` — the Flow Editor `FunctionNode` cannot label its input
   pins and shows `#1`, `#2`.
2. **Overloads collapse to one signature.** `substring` has a 2-argument form and a 3-argument form (`doc/reference`),
   but completions report only `(string, number, number) -> string`. The GUI cannot tell that the third argument is
   optional.
3. **Variadic functions look unary.** `coalesce | (any) -> any`.
4. **User callables report no return type.** `monthly | (amount: number)` — no `-> …` part.

```ts
const doc = '{\n  x: \n}';
MutableDecisionService.completions(doc, doc.indexOf('x: ') + 3)
  .options.filter((o) => o.type === 'function')
  .map((o) => `${o.label} | ${o.detail}`);
// [..., 'round | (number, number) -> number', 'substring | (string, number, number) -> string',
//  'coalesce | (any) -> any', ...]
```

**Expected behaviour:** a structured built-in catalog, for example `get('*', 'BUILTIN_DEFINITIONS')` or a static
`builtins()`. It returns `PortableFunctionSchema`-shaped entries with named `@parameters`, optional/variadic markers per
parameter (or one entry per overload), and `@return`. `get('*', 'ALL')` + `get('*', 'EXTERNAL_DEFINITIONS')` already
cover user callables.

## [VALID] Argument type-mismatch link error names an internal node id, not the argument

**What is wrong:** a named argument of the wrong type fails linking with a message that names an internal node id. The
message does not say which call or which argument is wrong. A missing argument, by contrast, gets a clear message
(`E113: function 'risk' call is missing required argument 'segment'`).

```ts
// ruleset risk(age: number, income: number, segment: string)
// d: risk(age: applicant.age, income: applicant.income, segment: applicant.income)
await service.execute('*');
// execution error: linker error: type mismatch in node NodeId(7): expected string, found number
```

The Flow Editor `FunctionNode` and the Boxed Editor must attach the error to one argument row. Today they can only
assume that the row the user edited last caused it.

**Expected behaviour:** an error code and a message in the E113 style, for example
`function 'risk' argument 'segment' expects string, found number`, ideally with the field path (`d`).

## [VALID] `optimise` cannot declare one decision variable per list element

**What is wrong:** an `optimise` element accepts only scalar, individually named decision variables. A model cannot
declare a variable for each element of a list input, or add up variables over a list in the objective or a constraint.
The limit is in the EdgeRules linker, not in the solver: HiGHS solves problems with thousands of integer variables. The
optimisation spec lists "Batch / indexed variables" as deferred (`OPTIMISATION_METAPHOR_SPEC.md` § 15.5).

```edgerules
optimise pick(values: number[], capacity: number): {
    variables: { calls: <number[], integer: true, min: 0> }
    maximise: sum(for i in 0..(count(values) - 1) return values[i] * calls[i])
    constraints: { time: sum(for c in calls return 30 * c) <= capacity }
}
// E332: variable 'calls' must be a <number, ...> — decision variables are always numbers

// with a scalar variable, a sum over a list is rejected too:
//     maximise: sum(for v in values return v * call)
// E336: objective is not affine in the decision variables: a decision variable inside the function 'sum'
```

As a result, an assignment problem over a list (for example, choosing a channel for each of 100 clients in
`models/client-outreach`) cannot be modelled client by client. The model groups the clients into segments, writes one
variable per segment and channel by hand (22 variables), and gives the solver's counts to clients with rules. The solver
then works from segment averages, so the plan can be slightly worse than the true optimum per client, and the number of
variables changes the DSL text instead of the input data.

**Real-world example to rebuild when this is fixed — `models/client-outreach`:** a sales team of 2 workers has a 7-hour
day to reach 100 prospects. Each prospect gets one action: a call (30 min, lift 0.25), an email (15 min, 0.15), an SMS
(5 min, 0.08) or nothing. Rules give each client and channel an expected value (deal revenue × propensity × lift ×
preference fit) and decide which channels the client may get (cooling-off period, phone consent, email address, no SMS
for private clients). The optimisation maximises the total expected value within 840 team minutes and 40 SMS, with at
most one action per client. With indexed variables this becomes 3 binary variables per client (`call[i]`, `email[i]`,
`sms[i]`), a blocked channel bound to 0, and a constraint `call[i] + email[i] + sms[i] <= 1` for each client. The
segments, `segmentPicks` and the ranking rules can then be removed.

**Expected behaviour:** `optimise` supports indexed variables: a variable declared per element of a list parameter (for
example `<number[], integer: true, min: 0>` sized by the list), with `sum`/`for` over those variables allowed in the
objective and the constraints as long as the expression stays affine. The result returns the variable as a list, in the
order of the input list.

## [NOT A BUG] `getCode('*')` drops source comments

**What happens:** `fromCode` followed by `getCode('*')` returns the code without its comments. (Output formatting is
multi-line since `0.0.8-alpha.202610231845`.)

```ts
MutableDecisionService.fromCode('{\n  // keep me\n  a: 1\n  b: a + 1\n}').getCode('*');
// "{\n    a: 1\n    b: a + 1\n}"
```

**Why it is not a bug:** the engine intentionally does not keep comments. Comments can be large, and keeping them would
fill the WASM cache with text that the engine does not use. Documentation belongs to the documentation service, not to
the engine. A host that must keep authored comments stores the source text itself and does not persist from
`getCode('*')`.

## [NOT A BUG] `rename()` migrates references only for callables

**What happens:** `rename()` updates references for some entry kinds and leaves them dangling for others:

| Renamed entry                                                  | References migrated?                                                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `func` / `ruleset` / `loop`, and their own declared parameters | **Yes** — call sites and references relink, including a ruleset's cell-map `when` keys, boolean-expression `when` rows, and named-argument call sites |
| Plain field / context key / `type`                             | **No** — only the key changes; expressions that use the old name stay byte-identical and dangle                                                       |

Neither case throws for a linking reason.

**Why it is not a bug:** ruled by design upstream and documented since `0.0.6-alpha.202607291629` (the `rename` doc
comment in `dist/_core/mutable-service.d.ts`; `remove()` has the same caveat). The engine does not offer full
refactoring — `link()` exists to check the model after any mutation. A host that renames anything outside the first row
must call `link()` and show the error. `DecisionTableEditor` renames only a ruleset or its parameters — the migrating
case. `createBoxedEditorService.rename` renames arbitrary rows and deliberately skips the link check (Resolved Decision
#12, `phase-08-quality-gate.md`). That is an editor-side gap: `docs/qa/current-bugs.md` Bug 10 option 3.
