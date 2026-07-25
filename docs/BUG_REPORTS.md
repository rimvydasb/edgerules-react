# EdgeRules Engine Bug Reports

Every entry below was reproduced against `@edgerules/node`, `@edgerules/web`, and, where relevant,
`@edgerules/portable` version **0.0.1-alpha.202607252017** on 2026-07-25.

The upgrade fixed the previously recorded optimisation CRUD, whole-root key-order, and
`PortableTypeDefinition` contract bugs. The expression-wrapped type-definition report was also removed because the
engine behavior is intentional and the Portable contract now documents the accepted forms.

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
