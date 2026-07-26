# EdgeRules Engine Bug Reports

Every entry below was reproduced against `@edgerules/node`, `@edgerules/web`, and, where relevant,
`@edgerules/portable` version **0.0.2-alpha.202607261827** on 2026-07-26.

The upgrade fixed the previously recorded `loop` filter-view visibility bug and the `set()` non-string
`expression` rejection bug — both removed below. `listTestSubjects` in `src/components/tests-manager/model/subjects.ts`
no longer needs the `toPortable()` scan workaround for loop discovery; `loop-schema` is now projected in `FIELDS`/`ALL`
like `func`/`ruleset`.

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
