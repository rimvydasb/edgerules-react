# EdgeRules Engine Bug Reports

## Root metadata (`@model-name`, `@model-version`) is silently dropped by `set('*', …)` — a mutable service can set it at construction but never edit it (@edgerules/node + @edgerules/web)

> KNOWN ISSUE. IGNORE IT.
> This issue is well known and will be revisited in future stories.

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


