# EdgeRules Engine Bug Reports

## Ruleset CRUD findings (@edgerules/web + @edgerules/node 0.0.0-alpha.202607071338, 2026-07-07)

Found while building the Decision Table Editor. Repro scripts probe a model containing
`ruleset risk(age: number, income: number, segment: string)` with two cell-map rules and a default.

### 1. Cell-level `when` set rejects unary tests

`set('risk.rules[0].when.age', '> 80')` → `WrongFieldPath: invalid portable structure: expression
parse yielded no field`. `set(..., '21..30')` → `Execution: linker error: type mismatch … expected
number, found number[]`. Only `'any'` is accepted. This contradicts RULESETS_REFERENCE.md's Portable
JSON examples (`when` maps a parameter to a unary-test string such as `"18..25"`, `"> 30000"`) and the
`PortableRule.when` contract in `@edgerules/portable`. **Workaround:** replace the whole rule node
(`set('risk.rules[0]', rule)`) — unary tests including ranges are accepted there.

### 2. A failed `set` is not rolled back (model left broken)

After the failed `set('risk.rules[0].when.age', '21..30')` above, every subsequent `get`/`set`/
`execute` on the service fails with the same linker error — one rejected edit poisons the whole
model. Re-`set`ting the last known-good rule or ruleset node does restore it, so mutations look
apply-then-link without rollback on link failure. Expected: a `set` that returns a `PortableError`
should leave the model untouched.

### 3. `remove` unsupported on `when` cells and `@default`

`remove('risk.rules[0].when.age')` and `remove('risk.default')` → `WrongFieldPath`. There is no
path-level way to clear a cell back to `any` (workaround: `set(..., 'any')` or whole-rule replace)
or to drop the default row (workaround: whole-ruleset replace without `@default`).

### 4. `get` is asymmetric with `set` on rule paths

`set('risk.rules[0].then.limit', 1500)` works, but `get('risk.rules[0].then.limit')`,
`get('risk.rules[0]')` and `get('risk.rules')` all return `EntryNotFound`. Only `get('risk.*')`
(whole definition) and `get('risk')` (schema) resolve.

### 5. `get` denormalizes authored unary tests

A rule authored as `when: { age: 18..25, segment: "retail" }` echoes from `get('risk.*')` as
`{ "age": "... >= 18 and ... <= 25", "segment": "... = \"retail\"" }` — the compact sugar the user
wrote (and that `PortableRule` documents) is lost, so a GUI must re-sugar for display. Named unary
tests (`age: isCore`) and `any` echo faithfully.

### 6. `rename` of a ruleset does not relink call sites

`rename('risk', 'riskLevel')` returns success, but a field calling `risk(...)` is left with
`linker error: E102: unresolved reference 'risk'` — the model is silently broken after a successful
rename.

### 7. Ruleset parameters cannot carry defaults (add-column gap)

Adding a parameter via whole-ruleset replace fails with `E113: function 'risk' call is missing
required argument` even when the new parameter is `{ '@kind': 'type', type: 'number', default: 0 }`,
and the DSL has no way to declare a defaulted ruleset parameter either. Consequence: an editor
cannot add an input column to a ruleset that already has call sites without simultaneously updating
every call site.

### 8. Bare special values do not parse as portable expression strings

Setting a `then` cell to the string `"Missing"` or `"NotApplicable"` fails with
`Parse: UnexpectedToken`, although both are first-class special values in the DSL
(SPECIAL_VALUES_SPEC.md). There is no way to author a "no value" output cell through the Portable
API; `"''"` / `"0"` literals work.

