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
const service = MutableDecisionService.fromCode('{ application: { amount: <number> } }');

service.set('application', {
    '@kind': 'context',
    '@node': 'ChartNode',
    '@node-name': 'Application',
    '@description': 'Loan inputs',
    amount: {'@kind': 'type', type: 'number'},
});

service.toPortable().application;
// { '@kind': 'context', amount: { '@kind': 'type', type: 'number' },
//   '@node': 'ChartNode', '@node-name': 'Application' }
```

Expected behavior: the engine must retain and re-emit `@description`, as it does `@node` and `@node-name`.
