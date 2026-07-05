# EdgeRules Engine Bug Reports

Bugs found in the EdgeRules engine (`edgerules-v2`) while implementing the Project Explorer
component against a real `MutableDecisionService`, per `docs/PROJECT_EXPLORER_STORY.md`.

**Engine version tested**: `@edgerules/node` / `@edgerules/web` / `@edgerules/portable`
`0.0.0-alpha.202607041229` (published npm alpha snapshot).

Both bugs were confirmed empirically (not just by reading source) by running the exact model
from the Project Explorer story doc against a real, unmodified `MutableDecisionService` — no
mocking involved.

---

## Bug 1: `get()` never projects `@kind: 'invocation'` on read

### Summary

`@edgerules/portable`'s `PortableNode` union includes an `@kind: 'invocation'` shape
(`PortableInvocationDefinition`, with `@method` holding either a user function name or one of the
four reserved hit-policy keywords — `firstMatch`, `uniqueMatch`, `collectMatches`, `bestMatch`).
This shape is produced correctly on the **write** path (`crates/portable/src/convert.rs`,
`from_portable_invocation`), and is documented in `EDGERULES_API_SPEC.md` as a value `get()` can
return. However, the **read** path's projector (`crates/portable/src/schema.rs`,
`TypeSchemaProjector`) has no `Invocation` case at all — its `SchemaTypeKind` enum (from
`edgerules-linker`) only has `Object` / `Type` / `Array` variants. Every computed field —
whether a plain expression, a plain user-function call, or a decision-table invocation — is
projected through the generic `Object`/`Type` path instead.

### Repro

```
{
    risk: firstMatch({
        inputs: { age: 20 }
        rules: [
            { when: { age: 18..25 }, then: { level: "high" } }
        ]
        default: { level: "none" }
    })
}
```

```js
const service = MutableDecisionService.fromCode(code);
service.get('risk');
```

**Expected** (per `EDGERULES_API_SPEC.md` and the `PortableNode` contract):

```json
{ "@kind": "invocation", "@method": "firstMatch", "@arguments": [ /* ... */ ] }
```

**Actual** — depends on the invocation's return shape, confirmed both variants:

- Record-shaped return (as above, `default: { level: "none" }`):
  ```json
  { "@kind": "context", "level": "string" }
  ```
  Note this isn't even a well-formed `PortableContext` per the published TS types — `level`'s
  value is a bare type-name string (`"string"`), not a nested `PortableNode` object.
- Scalar-shaped return (e.g. `default: 0`):
  ```json
  { "@kind": "type", "type": "number", "readOnly": true }
  ```

Same result regardless of `@method` — a plain user-function call (e.g. `score: calcScore(x)`)
and a `firstMatch` decision table are indistinguishable on read today.

### Impact

A host application (e.g. the Project Explorer component, or any GUI built on the CRUD API) has
no way to detect that a field is a decision-table invocation vs. an ordinary computed field via
`get()`. Project Explorer's icon rule ("`[dt]` only when `@kind: 'invocation'` and `@method` is a
hit-policy keyword") is implemented correctly against the documented type contract, but can never
actually render `[dt]` against a live model until this is fixed.

### Suggested fix direction

Add an `Invocation` (or similar) variant to `SchemaTypeKind` in `edgerules-linker`, and a
corresponding case in `TypeSchemaProjector` (`crates/portable/src/schema.rs`) that projects an
invocation field as `{'@kind': 'invocation', '@method': ..., '@arguments': ...}` (mirroring
`from_portable_invocation`'s write-side shape), instead of falling through to the generic
`Object`/`Type` projection.

---

## Bug 2: A function nested inside a sub-context is invisible via that sub-context's own `get()`, and is instead flattened onto an ancestor fetch as a dotted key

### Summary

Fetching a context that contains only a function field returns that context as empty — the
function is not listed among its fields. Instead, the function's schema appears as a *sibling*
key on whichever ancestor context was fetched, using the function's full dotted path as a literal
object key (e.g. `"nested.deep"`), rather than nested one level under its lexical parent (`nested`).
A function declared directly at the fetched level (no intervening sub-context) is unaffected.

### Repro

```
{
    nested: {
        func deep(): {
            subField: 10
            deepContext: { x: 1 }
            return: subField
        }
    }
}
```

```js
const service = MutableDecisionService.fromCode(code);
service.get('*');     // fetch root
service.get('nested'); // fetch the sub-context directly
```

**Expected**: `get('nested')` returns `{'@kind': 'context', deep: {'@kind': 'function-schema', ...}}`.

**Actual**:

```js
// get('*')
{
  "@kind": "context",
  "nested": { "@kind": "context" },
  "nested.deep": { "@kind": "function-schema", "@parameters": {}, "@return": "number" }
}

// get('nested')
{ "@kind": "context" }   // empty — no `deep` field at all
```

Also confirmed: `get('nested', 'FUNCTION_DEFINITIONS')` returns `EntryNotFound` — function
definitions are only fetchable by the function's own full path (`get('nested.deep', 'FUNCTION_DEFINITIONS')`
works), not via a filter on the containing context's path.

By contrast, a function declared directly at the fetched level works correctly:

```
{ func topFn(): 42 }
```
```js
service.get('*'); // { "@kind": "context", "topFn": { "@kind": "function-schema", ... } } — correct, same level
```

### Impact

A host walking the model context-by-context (fetching one level, rendering it, lazily fetching a
child context on expansion — the standard/recommended navigation pattern per
`EDGERULES_CRUD_SPEC.md`) will never discover a function that lives inside a nested context: the
parent context's own targeted fetch shows it as empty, and the function only turns up as an
oddly-named dotted key on whatever *ancestor* happened to be fetched instead — which may not even
be the immediate parent if the nesting is deeper than one level (untested, but the flattening
behavior suggests it would surface on the topmost/root fetch regardless of depth).

Project Explorer works around the *symptom* (filtering out dotted keys, since `.` can never
appear in a real EdgeRules identifier, to avoid rendering a false sibling), but this does not
recover the missing function — it simply prevents a misplaced/duplicate tree node. The function
remains genuinely unreachable via the documented per-context navigation pattern until this is
fixed.

### Suggested fix direction

The context projector (likely the same `crates/portable/src/schema.rs` path, wherever it
enumerates a context's function children) should nest a function schema under its lexical parent
context's own field map when projecting that parent, rather than emitting it as a flattened
dotted-path key relative to whatever context was originally requested.
