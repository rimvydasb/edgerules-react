# EdgeRules Engine Bug Reports

Open engine defects only. A report is deleted once the engine fixes it; behaviour ruled _by design_ upstream moves to
[Clarified behaviour](#clarified-behaviour--not-bugs) as a short note so it is not re-filed.

All entries below were last re-verified against `@edgerules/node` / `@edgerules/web` **`0.0.7-alpha.202610201841`** on
**2026-10-21** with throwaway Node scripts — no React, no mocks. Every entry still reproduces on that version.

## Empty zero-column relations round-trip as lists

An empty relation has no record keys from which the engine can infer relation columns. After a mutable write, `[]`
therefore normalizes as a scalar list rather than a relation. A UI may preserve a relation with zero records once at
least one column is known, but cannot represent the distinct “zero columns, zero records” state across the portable
engine boundary. Phase 10's exact empty-relation browser case is marked **CANNOT COMPLETE**; the editor seeds a single
empty record when creating a zero-column relation as a compatibility workaround.

Expected behavior: portable data needs an unambiguous empty-relation representation, or engine metadata preserving the
intended collection kind when no values exist.

## Root `set('*', …)` rejects a valid model containing a root optimisation

When a linked model already contains a root-level `@kind: "optimise"` declaration, replacing the model with its own
portable root plus an unrelated ruleset-signature/call-site edit can fail with:

`invalid portable structure: optimise declarations are allowed only at the model root`

The optimisation is already a direct child of the root. The Boxed Editor hit this while atomically adding a decision
table condition column and its named call-site argument after a root optimisation had been created. The editor now works
around the engine defect by setting only the changed top-level definitions and linking after the batch, rather than
calling `set('*', …)`.

Expected behavior: `set('*', service.toPortable())` (and the same root with unrelated valid edits) must accept a
root-level optimisation exactly as initial construction does.

## Root metadata (`@model-name`, `@model-version`) is silently dropped by

`set('*', …)` — a mutable service can set it at construction but never edit it (@edgerules/node + @edgerules/web)

> KNOWN ISSUE. IGNORE IT. This issue is well known and will be revisited in future stories. Still reproduces on
> `0.0.6-alpha.202607291629`.

`MutableDecisionService.fromPortable({'@model-version': '1.4.0', ...})` preserves `@model-version` correctly (matches
`API_SPEC.md` "Limitations" #3: of the root context's reserved metadata keys, only `@model-version` is meant to
round-trip; `@model-name` is documented as accepted-on-parse-but-not-persisted). But a **root `set('*', …)` on an
already-constructed service drops both keys**, not just `@model-name` — the rest of the write applies correctly
(ordinary fields commit), only the two `@model-*` keys never make it through. So `@model-version` behaves correctly only
for a model's _initial_ construction; there is currently no way to change it (or set it for the first time) on a live
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

## Built-in function signatures are only exposed as lossy completion `detail` strings

Found on `0.0.6-alpha.202607291629`. The only API that lists built-in functions is the static
`MutableDecisionService.completions(code, pos)`: options with `type: 'function'` carry the signature as a free-text
`detail` string. There is no structured built-in catalog. The `detail` string loses information a GUI needs:

1. **No parameter names.** `round | (number, number) -> number` — the Flow Editor `FunctionNode` cannot label its input
   pins and falls back to `#1`, `#2`.
2. **Overloads collapse to one signature.** `substring` has a 2-argument and a 3-argument form (`doc/reference`), but
   completions report only `(string, number, number) -> string`. The GUI cannot tell that the third argument is
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

Expected behavior: a structured built-in catalog, for example `get('*', 'BUILTIN_DEFINITIONS')` or a static
`builtins()`, returning `PortableFunctionSchema`-shaped entries with named `@parameters`, per-parameter
optional/variadic markers (or one entry per overload), and `@return`. User callables are already covered by
`get('*', 'ALL')` + `get('*', 'EXTERNAL_DEFINITIONS')`.

---

## Argument type-mismatch link error names an internal node id, not the argument

Found on `0.0.6-alpha.202607291629`. A named argument of the wrong type fails linking with a message that names an
internal node id. The message does not say which call or which argument is wrong. A missing argument, by contrast, gets
a clear message (`E113: function 'risk' call is missing required argument 'segment'`).

```ts
// ruleset risk(age: number, income: number, segment: string)
// d: risk(age: applicant.age, income: applicant.income, segment: applicant.income)
await service.execute('*');
// execution error: linker error: type mismatch in node NodeId(10): expected string, found number
```

Expected behavior: an error code and a message in the E113 style, for example
`function 'risk' argument 'segment' expects string, found number`, ideally with the field path (`d`). The Flow Editor
`FunctionNode` and the Boxed Editor both need to attach the error to one argument row. Today they can only do that by
assuming the row the user just edited caused it.

## `getCode('*')` drops source comments and formatting

Found on `@edgerules/node` **`0.0.7-alpha.202610201841`** (2026-10-20). `fromCode` followed by `getCode('*')` returns a
single-line canonical form and silently deletes comments:

```ts
MutableDecisionService.fromCode('{\n  // keep me\n  a: 1\n  b: a + 1\n}').getCode('*');
// "{ a: 1; b: a + 1 }"
```

A project persisted from `getCode('*')` loses all authored comments on the first save, and every save of a multi-line
model produces one very long line, which makes Git diffs poor.

Expected behavior: preserve comments as trivia, or reject the operation instead of deleting them silently
(`GLOBAL_PROJECT_MANAGEMENT.md` §4.5); ideally offer a multi-line canonical printer.

---

## Clarified behaviour — not bugs

### `rename()` migrates references only for callables — by design

Reported as a defect against `0.0.5-alpha.202607291250`, ruled by design upstream and documented in
`0.0.6-alpha.202607291629` (the `rename` doc comment in `dist/_core/mutable-service.d.ts`; `remove()` carries the same
caveat). The engine does not offer full refactoring — `link()` exists to check the model after any mutation.

| Renamed entry                                                  | References migrated?                                                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `func` / `ruleset` / `loop`, and their own declared parameters | **Yes** — call sites and references relink, including a ruleset's cell-map `when` keys, boolean-expression `when` rows, and named-argument call sites |
| Plain field / context key / `type`                             | **No** — only the key changes; expressions using the old name are left byte-identical and dangle                                                      |

Neither case throws for a linking reason, so a host that renames anything outside the first row must call `link()`
itself and surface the error. `DecisionTableEditor` only renames a ruleset or its parameters — the migrating case.
`createBoxedEditorService.rename` renames arbitrary rows and deliberately skips the link check (Resolved Decision #12,
`phase-08-quality-gate.md`), which is an editor-side gap: `docs/qa/current-bugs.md` Bug 10 option 3.
