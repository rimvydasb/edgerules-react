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

## Expression-wrapped typed values are rejected inside type definitions — open (@edgerules/node + @edgerules/web)

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

Passing the wrapper as the raw string `'<number, required: true>'` succeeds. `BoxedEditorService` therefore uses that
accepted string form only while denormalizing `complexType` children; ordinary fields continue to use the uniform
expression wrapper. Expected behavior: expression-wrapped cell text should be parsed consistently in both positions,
or the Portable contract should explicitly document the type-definition-only string exception.

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
