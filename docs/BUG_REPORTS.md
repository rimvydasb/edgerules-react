# EdgeRules Engine Bug Reports

Every entry below was reproduced against `@edgerules/node`, `@edgerules/web`, and, where relevant,
`@edgerules/portable` version **0.0.1-alpha.202607252017** on 2026-07-25.

The upgrade fixed the previously recorded optimisation CRUD, whole-root key-order, and
`PortableTypeDefinition` contract bugs. The expression-wrapped type-definition report was also removed because the
engine behavior is intentional and the Portable contract now documents the accepted forms.

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

## A `loop` declaration is invisible to every `get` filter view (@edgerules/node + @edgerules/web)

`loop` is a callable metaphor on equal footing with `func` / `ruleset` / `optimise` — `execute('tally', {...})` runs it
and `get('tally')` returns a proper `@kind: "loop-schema"`. But listing the containing context never projects it, under
any filter, so a host cannot discover that `tally` exists in the first place. Each sibling metaphor is discoverable:
`func`/`ruleset` appear in `FIELDS`/`ALL`, and `optimise` has its `EXTERNAL_DEFINITIONS` catalog row.

```ts
const service = MutableDecisionService.fromCode(`{
  loop tally(values: number[]): {
    over: values
    state: { total: 0 }
    do: { total: state.total + item }
    return: state.total
  }
  result: tally([1, 2, 3])
}`);

for (const filter of ['FIELDS', 'ALL', 'FUNCTION_DEFINITIONS', 'TYPE_DEFINITIONS', 'EXTERNAL_DEFINITIONS']) {
  'tally' in service.get('*', filter); // false — every one
}

Object.keys(service.toPortable()); // ['@kind', 'tally', 'result'] — present here
service.get('tally'); // {'@kind': 'loop-schema', '@parameters': {...}, '@state': {...}, '@return': 'number'}
await service.execute('tally', { values: [1, 2, 3] }); // 6
```

This is the same class of gap that was fixed for `ruleset` (a `ruleset` field used to be omitted when listing its
containing context). The workaround is to scan `toPortable()` for `@kind: "loop"` entries and then `get(name)` each one
for its schema.

Expected behavior: a `loop` declaration is projected when listing its containing context, consistently with `func` and
`ruleset` in the `FIELDS`/`ALL` views — or, if it is meant to be catalog-only like `optimise`, as a row in
`EXTERNAL_DEFINITIONS`.
