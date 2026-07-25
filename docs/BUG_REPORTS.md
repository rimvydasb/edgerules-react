# EdgeRules Engine Bug Reports

Every entry below was reproduced against `@edgerules/node`, `@edgerules/web`, and, where relevant,
`@edgerules/portable` version **0.0.0-alpha.202607251019** on 2026-07-25.

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

## Optimise declarations are not addressable through path-scoped Portable CRUD — open (@edgerules/node + @edgerules/web + @edgerules/portable)

Both the Node build and the Web WASM build fully support `optimise` parsing, linking, whole-model Portable conversion,
solver registration, and execution. The remaining issue is specifically the path-scoped mutable service: it cannot
address or replace an authored `optimise` declaration.

```ts
const service = MutableDecisionService.fromCode(`{
  optimise plan(x: number): {
    variables: { value: <number, min: 0> }
    maximise: value
    constraints: { cap: value <= x }
  }
}`);

service.get('plan', 'ALL');
// { '@kind': 'error', type: 'EntryNotFound', ... }

service.get('plan', 'EXTERNAL_DEFINITIONS');
// { '@kind': 'optimise', '@parameters': ..., '@variables': ..., '@result': ... }

service.set('plan', service.toPortable().plan);
// { '@kind': 'error', type: 'WrongFieldPath',
//   message: 'invalid portable structure: unexpected @kind in expression position: optimise' }

service.set('plan.variables.value', {
  '@kind': 'type',
  type: 'number',
  min: 0,
});
// { '@kind': 'error', type: 'WrongFieldPath', ... }
```

The installed `@edgerules/portable` declaration also omits an optimise-definition interface from `PortableNode`, even
though `toPortable()` returns that runtime shape. This forces consumers to cast the valid wire object before passing
it to the typed CRUD API.

Expected behavior: `optimise` should be part of the exported `PortableNode` contract; `get(path, 'ALL')` should return
the authored definition consistently with function/ruleset definitions; and either whole-definition
`set('plan', node)` or the documented authored child paths (`plan.variables.value`, `plan.constraints.cap`, etc.)
must support edits. Until then `BoxedEditorService` can normalize and denormalize optimise rows through the real
engine's whole-model Portable path (and execute the rebuilt model), but path-scoped optimisation mutation and move
operations necessarily return the upstream `PortableError`.

## Expression-wrapped typed values are rejected inside type definitions — closed as expected behavior

A typed-value cell can normally be written as an expression wrapper and the mutable service re-parses it to the
concrete Portable kind:

```ts
service.set('application.amount', {
  '@kind': 'expression',
  expression: '<number, required: true>',
});
// succeeds and returns { '@kind': 'type', type: 'number', required: true, writeOnly: true }
```

The identical strategy fails when the cell is inside a whole `type-definition` write:

```ts
service.set('Applicant', {
  '@kind': 'type-definition',
  age: {
    '@kind': 'expression',
    expression: '<number, required: true>',
  },
});
// WrongFieldPath: expected a type-ref string or @kind:type object
```

This is not an engine bug. `PortableExpression` represents a computed model field and is not a member of the
`PortableTypeDefinition` field union. A complex type field is a type declaration, so its accepted Portable forms are
a `PortableTypedValue` object or a type-ref string:

```ts
service.set('Applicant', {
  '@kind': 'type-definition',
  age: { '@kind': 'type', type: 'number', required: true },
});
// succeeds

service.set('Applicant', {
  '@kind': 'type-definition',
  age: '<number, required: true>',
});
// also succeeds and is projected back as the same @kind:type shape
```

`BoxedEditorService` is therefore correct to emit raw type-ref strings while denormalizing `complexType` children;
ordinary data fields remain expression positions and may use `PortableExpression`.

## Whole-root `set('*', context)` does not apply authored key order — open (@edgerules/node + @edgerules/web)

Replacing a nested context with a reordered Portable context changes its authored key order, but performing the
corresponding whole-root write preserves the root's previous entity order:

```ts
const service = MutableDecisionService.fromCode('{ a: 1; b: 2 }');

service.set('*', { '@kind': 'context', b: 2, a: 1 });
service.toPortable();
// { '@kind': 'context', a: 1, b: 2 } — requested b/a order was not applied
```

Expected behavior: a whole-context `set` should have the same replacement and key-order semantics at `'*'` as it
does at a nested context path. This affects same-parent `BoxedEditorService.move()` calls at the model root: the
facade correctly rebuilds the Portable object's insertion order, but the engine echo retains the old order. The
Boxed Editor's fixed kind-group sorting still determines the visible placement of types/functions/rulesets/
optimisations; this gap only affects tie-breaking within the root's “everything else” group.

## Nested `PortableTypeDefinition` fields are declared but rejected — open (@edgerules/portable + @edgerules/node + @edgerules/web)

`PortableTypeDefinition` declares every field as
`PortableTypedValue | PortableTypeDefinition | string | undefined`, and its documentation says nested type
definitions represent object fields. The authoritative grammar instead permits only an `InlineTypeRef` per complex
type field, with nested object shapes expressed by referencing a separately named type.

Both mutable runtimes follow the grammar and reject the declared nested Portable shape:

```ts
service.set('Applicant', {
  '@kind': 'type-definition',
  address: {
    '@kind': 'type-definition',
    city: { '@kind': 'type', type: 'string' },
  },
});
// WrongFieldPath: expected a type-ref string or @kind:type object
```

The accepted representation is:

```ts
service.set('Address', {
  '@kind': 'type-definition',
  city: { '@kind': 'type', type: 'string' },
});
service.set('Applicant', {
  '@kind': 'type-definition',
  address: { '@kind': 'type', type: 'Address' },
});
```

Expected behavior: remove `PortableTypeDefinition` from the type-definition field union and update its documentation
to describe named type references, unless inline anonymous object types are intentionally added to the grammar and
runtimes.
