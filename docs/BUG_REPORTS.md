# EdgeRules Engine Bug Reports

## Root metadata (`@model-name`, `@model-version`) is silently dropped by
`set('*', …)` — a mutable service can set it at construction but never edit it (@edgerules/node + @edgerules/web)

> KNOWN ISSUE. IGNORE IT.
> This issue is well known and will be revisited in future stories.

`MutableDecisionService.fromPortable({'@model-version': '1.4.0', ...})` preserves `@model-version` correctly (matches
`EDGERULES_API_SPEC.md` "Limitations" #3: of the root context's reserved metadata keys, only `@model-version` is meant
to round-trip; `@model-name` is documented as accepted-on-parse-but-not-persisted). But a **root `set('*', …)`
on an already-constructed service drops both keys**, not just `@model-name` — the rest of the write applies correctly
(ordinary fields commit), only the two `@model-*` keys never make it through. So `@model-version` behaves correctly only
for a model's *initial* construction; there is currently no way to change it (or set it for the first time) on a live
service.

```ts
const service = MutableDecisionService.fromCode('{ amount: 10 }');
service.set('*', {...service.toPortable(), '@model-version': '2.0'});
service.toPortable();
// { '@kind': 'context', amount: 10 }  — '@model-version' never appears; 'amount' itself did commit
```

Expected behavior: a root `set('*', …)` should persist `@model-version` exactly as `fromPortable` does (and either
persist `@model-name` too or reject a write that sets it, per the sibling gap already noted in `EDGERULES_API_SPEC.md`).
`BoxedEditor`'s `Model Settings` dialog (`docs/boxed-editor/phase-05-context-menus-and-actions.md` §4) commits through
this same `set('*', …)` path, so today **neither** field it edits persists past the next reload — the dialog is
implemented and wired per spec, but blocked end-to-end on this engine gap.

## An untyped (`null`) `@parameters` value does not round-trip: `toPortable()` returns the string
`"null"`, which the next `set()` then rejects as an unknown type (@edgerules/node + @edgerules/web
`0.0.5-alpha.202607291250`)

`EDGERULES_API_SPEC.md` §"Function Definition" documents a `@parameters` value as one of a bare type string, a
`PortableTypedValue`, or **`null` for an untyped (unannotated) parameter**. Writing JSON `null` is accepted — `set()`
returns a correct schema (`{'@parameters': {arg: 'any'}}`) — but the very next `toPortable()` renders it back as the
**string** `"null"`. Any host that reads the model and writes it back (which is the only way to edit a function's
signature) therefore re-submits `"null"` as a real type-name reference, and the linker rejects it with `E102`.

```ts
const m = MutableDecisionService.fromCode('{ func f(): "" }');
m.set('f', {'@kind': 'function', '@parameters': {arg: null}, '@body': {'@kind': 'expression', expression: '""'}});
// → { '@kind': 'function-schema', '@parameters': { arg: 'any' }, '@return': 'any' }   ✅

m.toPortable().f['@parameters'];
// → { arg: 'null' }   ❌ expected { arg: null }

// Read-modify-write, i.e. adding a second argument through the documented API:
m.set('f', {'@kind': 'function', '@parameters': {arg: 'null', arg2: null}, '@body': {…
}
})
;   // succeeds
m.link();
// throws: execution error: linker error: E102: unknown type 'null' in node NodeId(3)
//         — not a built-in type and no visible 'type null: …' definition
```

Expected behavior: `toPortable()` should emit JSON `null` for an untyped parameter, exactly as `set()` accepts it, so a
read-modify-write cycle is lossless. (Alternatively `set()` should reject the string `"null"` rather than treating it as
a type reference, but the round-trip fix is the correct one.)

Impact: a function's signature cannot be edited more than once through the portable API. `BoxedEditor`'s
`Add argument` action fails silently from the second click onward — see `docs/qa/current-bugs.md` Bug 1 for the full
UI-level trace and the defensive workaround shipped in `normalize.ts`/`denormalize.ts`, which should be removed once
this is fixed.

##
`rename()` does not migrate references — renaming any referenced node silently makes the whole model unlinkable (@edgerules/node + @edgerules/web
`0.0.5-alpha.202607291250`)

> NOT A BUG AND NOT AN ISSUE: this is by design, because we do not have full refactoring capability. This is why link ()
> method is added to double-check the model after any mutation.

`rename()` rewrites the key only; every expression referring to the old name is left byte-identical. It returns
`undefined` (success) and performs no validation, so the corruption is silent until the next `link()`.

```ts
const m = MutableDecisionService.fromCode('{ application: { loanAmount: 1000 } total: application.loanAmount * 2 }');
m.rename('application', 'app');   // → undefined (success)
m.link();
// throws: execution error: linker error: E102: unresolved reference 'application.loanAmount' in node NodeId(3)

m.toPortable();
// { '@kind': 'context', app: {…}, total: { '@kind': 'expression', expression: 'application.loanAmount * 2' } }
//                                                                             ^^^^^^^^^^^ never rewritten
```

The same holds one level down — renaming `ctx.a` in `{ ctx: { a: 1  b: a + 1 } }` leaves `b`'s `a + 1` dangling — so it
is not a root-only special case.

Expected behavior: `rename()` should rewrite every reference to the renamed path (that is what distinguishes a rename
from a delete-and-recreate), or at minimum fail the rename when references would be left dangling, so the host can
present a choice instead of silently corrupting the model.

Impact: any host offering a rename affordance corrupts models by default. It is worse than a local breakage because the
linker is model-global: once the model doesn't link, every subsequent guarded write anywhere in it is rolled back, so
the editor appears to freeze. See `docs/qa/current-bugs.md` Bugs 10 and 11.

