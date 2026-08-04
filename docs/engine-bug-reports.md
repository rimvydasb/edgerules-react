# EdgeRules Engine Bug Reports

Open engine defects only. A report is deleted once the engine fixes it; behaviour ruled *by design* upstream moves to
[Clarified behaviour](#clarified-behaviour--not-bugs) as a short note so it is not re-filed.

All entries below were last re-verified against `@edgerules/node` / `@edgerules/web`
**`0.0.6-alpha.202607291629`** on **2026-07-29** with throwaway Node scripts — no React, no mocks.

## Empty zero-column relations round-trip as lists

An empty relation has no record keys from which the engine can infer relation columns. After a mutable write, `[]`
therefore normalizes as a scalar list rather than a relation. A UI may preserve a relation with zero records once at
least one column is known, but cannot represent the distinct “zero columns, zero records” state across the portable
engine boundary. Phase 10's exact empty-relation browser case is marked **CANNOT COMPLETE**; the editor seeds a single
empty record when creating a zero-column relation as a compatibility workaround.

Expected behavior: portable data needs an unambiguous empty-relation representation, or engine metadata preserving
the intended collection kind when no values exist.

## Root `set('*', …)` rejects a valid model containing a root optimisation

When a linked model already contains a root-level `@kind: "optimise"` declaration, replacing the model with its own
portable root plus an unrelated ruleset-signature/call-site edit can fail with:

`invalid portable structure: optimise declarations are allowed only at the model root`

The optimisation is already a direct child of the root. The Boxed Editor hit this while atomically adding a decision
table condition column and its named call-site argument after a root optimisation had been created. The editor now
works around the engine defect by setting only the changed top-level definitions and linking after the batch, rather
than calling `set('*', …)`.

Expected behavior: `set('*', service.toPortable())` (and the same root with unrelated valid edits) must accept a
root-level optimisation exactly as initial construction does.

## Root metadata (`@model-name`, `@model-version`) is silently dropped by

`set('*', …)` — a mutable service can set it at construction but never edit it (@edgerules/node + @edgerules/web)

> KNOWN ISSUE. IGNORE IT.
> This issue is well known and will be revisited in future stories.
> Still reproduces on `0.0.6-alpha.202607291629`.

`MutableDecisionService.fromPortable({'@model-version': '1.4.0', ...})` preserves `@model-version` correctly (matches
`API_SPEC.md` "Limitations" #3: of the root context's reserved metadata keys, only `@model-version` is meant to
round-trip; `@model-name` is documented as accepted-on-parse-but-not-persisted). But a **root `set('*', …)`
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
persist `@model-name` too or reject a write that sets it, per the sibling gap already noted in `API_SPEC.md`).
`BoxedEditor`'s `Model Settings` dialog (`docs/boxed-editor/phase-05-context-menus-and-actions.md` §4) commits through
this same `set('*', …)` path, so today **neither** field it edits persists past the next reload — the dialog is
implemented and wired per spec, but blocked end-to-end on this engine gap.

---

## Clarified behaviour — not bugs

### `rename()` migrates references only for callables — by design

Reported as a defect against `0.0.5-alpha.202607291250`, ruled by design upstream and documented in
`0.0.6-alpha.202607291629` (the `rename` doc comment in `dist/_core/mutable-service.d.ts`; `remove()` carries the same
caveat). The engine does not offer full refactoring — `link()` exists to check the model after any mutation.

| Renamed entry                                                  | References migrated?                                                                                                                                  |
|----------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| `func` / `ruleset` / `loop`, and their own declared parameters | **Yes** — call sites and references relink, including a ruleset's cell-map `when` keys, boolean-expression `when` rows, and named-argument call sites |
| Plain field / context key / `type`                             | **No** — only the key changes; expressions using the old name are left byte-identical and dangle                                                      |

Neither case throws for a linking reason, so a host that renames anything outside the first row must call `link()`
itself and surface the error. `DecisionTableEditor` only renames a ruleset or its parameters — the migrating case.
`createBoxedEditorService.rename` renames arbitrary rows and deliberately skips the link check (Resolved Decision #12,
`phase-08-quality-gate.md`), which is an editor-side gap: `docs/qa/current-bugs.md` Bug 10 option 3.
