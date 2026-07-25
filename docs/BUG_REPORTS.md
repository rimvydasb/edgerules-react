# EdgeRules Engine Bug Reports

## Referenced value-field rename leaves the model invalid — open (@edgerules/node + @edgerules/web, 2026-07-16)

> KNOWN AND REJECTED! This is known behavior that will not be fixed. If we rename referred value, model will
> not link - we cannot simply reject rename, because there will be no way renaming the destination field. Leaving model
> in unlinked/invalid state we put it in "refactoring" state so we can continue refactoring the model. Global
> rename/refactor might fix the problem, but it is way too complicated for small sized WASM.

Verified against the currently installed and npm `alpha` dist-tag version
**0.0.0-alpha.202607152015**. Renaming a referenced value field returns success, but does not rewrite the reference or
roll the rename back. The next linked `get` returns an error and the Portable snapshot contains the new declaration
name with the old reference.

```ts
const service = MutableDecisionService.fromCode('{ a: 1; b: a + 1 }');

service.rename('a', 'renamed'); // returns undefined (success)

service.toPortable();
// { renamed: 1, b: { '@kind': 'expression', expression: 'a + 1' } }

service.get('*');
// PortableError: E102 unresolved reference 'a'
```

The same behavior occurs for qualified nested references, for example renaming `application.amount` while another
field references `application.amount`.

Expected behavior: `rename` must either rewrite affected references and return success, or return `PortableError` and
leave the original model unchanged. Until fixed, editors must force a linked read after `rename` and apply the inverse
rename when validation fails.

## `@description` is discarded by Portable CRUD writes — open (@edgerules/node + @edgerules/web, 2026-07-16)

> KNOWN AND POSTPONED! For now, it is unclear if we should use description annotation or in DSL or DSL must capture
> comments under `//` - will be implemented in the future.

Verified against the installed **0.0.0-alpha.202607152015** engine. The Portable contract permits
`@description` on every node, but `set()` accepts a node carrying it and silently drops the property from both
`get()` and `toPortable()`. Annotations on the same write persist correctly.

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

## Optimise declarations are not mutable through the Portable CRUD API — open (@edgerules/node + @edgerules/web + @edgerules/portable, 2026-07-25)

Verified against the repository's installed **0.0.0-alpha.202607152015** packages and the npm `alpha` dist-tag
**0.0.0-alpha.202607251019**. The installed version rejects `optimise` at DSL parse time. The newer alpha parses and
serializes an `optimise` declaration and exposes its schema through `EXTERNAL_DEFINITIONS`, but its mutable service
still cannot address or replace that declaration:

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

The latest `@edgerules/portable` declaration also omits an optimise-definition interface from `PortableNode`, even
though `toPortable()` returns that runtime shape. This forces consumers to cast the valid wire object before passing
it to the typed CRUD API.

Expected behavior: `optimise` should be part of the exported `PortableNode` contract; `get(path, 'ALL')` should return
the authored definition consistently with function/ruleset definitions; and either whole-definition
`set('plan', node)` or the documented authored child paths (`plan.variables.value`, `plan.constraints.cap`, etc.)
must support edits. Until then `BoxedEditorService` can normalize optimise rows from `toPortable()` (and enrich them
from `EXTERNAL_DEFINITIONS` on engines that provide it), but real-engine optimisation mutation and move round trips
necessarily return the upstream `PortableError`.

## Expression-wrapped typed values are rejected inside type definitions — open (@edgerules/node + @edgerules/web, 2026-07-25)

Verified against **0.0.0-alpha.202607152015**. A typed-value cell can normally be written as an expression wrapper
and the mutable service re-parses it to the concrete Portable kind:

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

## Whole-root `set('*', context)` does not apply authored key order — open (@edgerules/node + @edgerules/web, 2026-07-25)

Verified against **0.0.0-alpha.202607152015**. Replacing a nested context with a reordered Portable context changes
its authored key order, but performing the corresponding whole-root write preserves the root's previous entity order:

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
