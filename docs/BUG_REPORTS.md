# EdgeRules Engine Bug Reports

Every entry below was reproduced against `@edgerules/node`, `@edgerules/web`, and, where relevant,
`@edgerules/portable` version **0.0.2-alpha.202607261827** on 2026-07-26.

The upgrade fixed the previously recorded `loop` filter-view visibility bug and the `set()` non-string
`expression` rejection bug — both removed below. `listTestSubjects` in `src/components/tests-manager/model/subjects.ts`
no longer needs the `toPortable()` scan workaround for loop discovery; `loop-schema` is now projected in `FIELDS`/`ALL`
like `func`/`ruleset`.

## Root metadata (`@model-name`, `@model-version`) is silently dropped by `set('*', …)` — a mutable service can set it at construction but never edit it (@edgerules/node + @edgerules/web)

`MutableDecisionService.fromPortable({'@model-version': '1.4.0', ...})` preserves `@model-version` correctly (matches
`EDGERULES_API_SPEC.md` "Limitations" #3: of the root context's reserved metadata keys, only `@model-version` is
meant to round-trip; `@model-name` is documented as accepted-on-parse-but-not-persisted). But a **root `set('*', …)`
on an already-constructed service drops both keys**, not just `@model-name` — the rest of the write applies
correctly (ordinary fields commit), only the two `@model-*` keys never make it through. So `@model-version` behaves
correctly only for a model's *initial* construction; there is currently no way to change it (or set it for the first
time) on a live service.

```ts
const service = MutableDecisionService.fromCode('{ amount: 10 }');
service.set('*', { ...service.toPortable(), '@model-version': '2.0' });
service.toPortable();
// { '@kind': 'context', amount: 10 }  — '@model-version' never appears; 'amount' itself did commit
```

Expected behavior: a root `set('*', …)` should persist `@model-version` exactly as `fromPortable` does (and either
persist `@model-name` too or reject a write that sets it, per the sibling gap already noted in `EDGERULES_API_SPEC.md`).
`BoxedEditor`'s `Model Settings` dialog (`docs/boxed-editor/phase-05-context-menus-and-actions.md` §4) commits through
this same `set('*', …)` path, so today **neither** field it edits persists past the next reload — the dialog is
implemented and wired per spec, but blocked end-to-end on this engine gap.

## `@description` is discarded by Portable CRUD writes — postponed (@edgerules/node + @edgerules/web)

The Portable contract permits `@description` on every node, but `set()` accepts a node carrying it and silently drops
the property from both `get()` and `toPortable()`. Annotations on the same write persist correctly. The engine team
has postponed this while deciding whether descriptions should use a dedicated annotation or be derived from DSL
comments.

```ts
const service = MutableDecisionService.fromCode(
  '{ application: { amount: <number> } }',
);

service.set('application', {
  '@kind': 'context',
  '@node': 'ChartNode',
  '@node-name': 'Application',
  '@description': 'Loan inputs',
  amount: { '@kind': 'type', type: 'number' },
});

service.toPortable().application;
// { '@kind': 'context', amount: { '@kind': 'type', type: 'number' },
//   '@node': 'ChartNode', '@node-name': 'Application' }
```

Expected behavior: the engine must retain and re-emit `@description`, as it does `@node` and `@node-name`.

## `execute()` input for a computed or unknown path is silently echoed as if it had been applied (@edgerules/node + @edgerules/web)

`execute(method, input)` accepts input keys that bind nothing — a computed (`readOnly`) field, or a path that does not
exist in the model at all — without any error. Evaluation correctly ignores them, but the returned result still
contains the supplied value, so a host cannot tell an applied input from an ignored one. For a computed field the
result is actively misleading: the field reads back as the caller's value while every expression depending on it used
the authored value.

```ts
const service = MutableDecisionService.fromCode(
  '{ maxLimit: 10000; age: <number>; ctx: { inner: maxLimit + 1 } }',
);

await service.execute('*', { age: 5, maxLimit: 50 });
// { age: 5, maxLimit: 50, ctx: { inner: 10001 }, derived: … }
//          ^^^^^^^^^^^^ reads back as 50, but `ctx.inner` proves 10000 was used

await service.execute('*', { age: 5, 'credit.balance': 1 });
// { age: 5, 'credit.balance': 1, … }  — a non-existent path echoed verbatim
```

The echo comes from `repointInputView` in `packages/_core/src/decision-service.ts`, which merges
`{...input, ...result}`. That is correct for genuinely bound inputs (the engine omits those from `result` by design —
`EXTERNAL_EXECUTIONS_SPEC.md` §10), but the engine also omits a computed field from `result` when the caller supplied a
key for it, so the ignored value survives the merge and wins.

Expected behavior: either honour the override, or reject the call with a `PortableError`. Failing both, the engine must
keep computed fields in `result` (so the merge cannot overwrite them) and report unbound input keys to the host.
`API_SPEC.md` already states that computed fields are ones the host "reads but does not supply at execution time" — so
supplying one is a caller error the API should surface rather than absorb.

## Array-typed fields reject elements with differing optional-field shapes — linker treats a heterogeneous array as a type mismatch (@edgerules/node + @edgerules/web)

A single (non-array) value happily omits an optional field of its declared type — `set('a', {name: "Ada"})` against
`type Person: { name: <string, required: true>; age: <number> }; a: <Person, required: true>` succeeds and `age`
simply doesn't appear. The same optionality is rejected the moment the value sits inside an **array**: every element
of an array-typed field is required to share one identical inferred structural type, so a record that omits an
optional field errors on the very next `get`/`set` touching that array — even though nothing about the declared item
type demands it.

```ts
const service = MutableDecisionService.fromCode(`{
  people: [
    { name: "Ada", age: 32 },
    { name: "Lin" }
  ]
}`);

service.get('people[1]', 'ALL');
// { '@kind': 'error', type: 'Execution',
//   message: 'linker error: type mismatch in node NodeId(…): expected {age: number; name: string}, found {name: string}' }
```

The same error fires for a plain literal array with no declared type at all (inferred structurally from the first
element), for `MutableDecisionService.fromPortable(...)` given the identical heterogeneous array directly (bypassing
the DSL parser), for a `set()` that only ever *adds* a field to some elements of an already-homogeneous array (e.g.
adding a new column to one record of a `people` relation without immediately backfilling every other record), and for
appending a wholly-blank new record (`{}`) to an already-homogeneous array — all four reproduce the identical
`type mismatch` linker error on the very next `get`/`set`.

Expected behavior: an array's element type check should apply per-element against the declared/inferred item type
(honouring `required: false` per field, exactly as the non-array case already does), not demand byte-for-byte
identical shapes across every element. This blocks `BoxedEditor`'s `relation` row kind from ever representing a
genuinely heterogeneous collection (a record missing a field, or a column added but not yet backfilled everywhere)
through the real engine — `docs/boxed-editor/phase-03-collections-list-and-relation.md` §3 requires exactly this
("a record missing a field renders an empty cell, never a nested field row"), and Phase 3's tests fall back to
constructing the `BoxedRowData`/`PortableNode` directly (as `normalization.test.ts` already did in Phase 1) to verify
the rendering side of this contract without going through the engine's `get()`.
