# EdgeRules Engine Bug Reports

## Ruleset CRUD findings — resolved (@edgerules/web + @edgerules/node, 2026-07-08)

The eight bugs previously logged here (found 2026-07-07 against alpha.202607071338 while building the
Decision Table Editor: cell-level `when` unary tests rejected, failed `set` not rolled back, `remove`
unsupported on `when` cells/`@default`, `get`/`set` path asymmetry on rule sub-paths, `get` denormalizing
authored unary tests, `rename` not relinking call sites, ruleset parameters unable to carry defaults, and
bare special values failing to parse as portable expression strings) are all fixed as of
**alpha.202607080846**. Verified with repro scripts re-running each case against the upgraded
`@edgerules/node`/`@edgerules/web`/`@edgerules/portable` packages — every case now returns the expected
success result instead of an error, and previously-corrupted-model scenarios leave the model intact.

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
