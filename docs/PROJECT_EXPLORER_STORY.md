# EdgeRules Project Explorer

Project explorer is a React component that allows users to view and manage EdgeRules projects. Project Explorer mimics
well known IDE's project explorers. However, since EdgeRules is basically a "code-first" system, the project explorer is
not a file system explorer. Instead, it is a view of the EdgeRules Portable Format.

The project explorer allows users to view the structure of the following EdgeRules project components:

## Implementation Details

```edgerules
{
    type Person: {
        name: <string>; age: <number>; tags: <string[]>
    }
    type PeopleList: <Person[]>
    globalConst: 42
    nested: { // sub-context inside global context
        func deep(): { // function context (as well as that function's top context)
            subField: 10
            deepContext: { // sub-context inside function context
                x: 1
            }
            return: subField // function result field
        }
    }
    list: [{a: 1}, {a: 2}] // array of objects
    ruleset risk(age: number): { // decision table: a named, callable rule matrix
        hitPolicy: "first-match"
        rules: [
            { when: { age: 18..25 }, then: { level: "high" } }
        ]
        default: { level: "none" }
    }
}
```

`risk` uses the `first-match` hit policy. EdgeRules has four ruleset hit policies — `first-match`, `unique-match`,
`collect-matches`, `best-match` — all rendered with the same `[dt]` icon; the policy itself is only visible once the
Decision Table Editor is opened.

Project Explorer display example as a tree view. Children of a context always render in this fixed group order:
`[types]`, `[vars]`, then contexts/functions/decision tables (`[ctx]`/`[func]`/`[dt]`) in the order they appear in the
source/Portable JSON:

```text
.
├── [types] Types
├── [vars] Variables
├── [ctx] nested
│   └── [func] deep()
├── [dt] risk()

```

Expanding `[types]` and `[vars]` lists their individual entries, each with its own single-item icon:

```text
.
├── [types] Types
│   ├── [type] Person
│   └── [type] PeopleList
├── [vars] Variables
│   ├── [var] globalConst
│   └── [var] list
├── [ctx] nested
│   └── [func] deep()
├── [dt] risk()

```

### Icons

- `[vars]` - Variables context (global or nested)
- `[var]` - Single variable
- `[ctx]` - Nested context
- `[func]` - Function context
- `[dt]` - Decision Table context
- `[types]` - Types in the context
- `[type]` - Single type

| Icon      | Description                          | On Expand           | On Click                                 |
|-----------|--------------------------------------|---------------------|------------------------------------------|
| `[vars]`  | Variables context (global or nested) | Lists all variables | Boxed Expressions Editor (all variables) |
| `[var]`   | Single variable                      | None                | Boxed Expressions Editor (all variables) |
| `[ctx]`   | Nested context                       | Render sub-tree     | None                                     |
| `[func]`  | Function context                     | None                | Boxed Expressions Editor                 |
| `[dt]`    | Decision Table context               | None                | Decision Table Editor                    |
| `[types]` | Types in the context                 | Lists all types     | EdgeRules Types Editor (all types)       |
| `[type]`  | Single type                          | None                | EdgeRules Types Editor (all types)       |

### Details

1. **Variables**: The context variables containing constants and derivations for that context e.g. `globalConst` and
   `list`. The variables section hides all variables in that context.
2. **Contexts**: The nested contexts within the current context e.g. `nested` and `deepContext`.
3. **Functions**: The functions defined within the current context e.g. `deep()`.
4. **Types**: The type definitions in that context e.g. `Person` and `PeopleList`. The types section hides all type
   definitions in that context.
5. **Decision Tables**: A context field is rendered as a Decision Table (`[dt]`) only when it is a `ruleset`
   declaration (`@kind: "ruleset"`, or its `"ruleset-schema"` projection on `get()`) — a named, callable rule matrix,
   never a call-position form. Every invocation (`@kind: "invocation"`), whether it calls a plain user function
   (e.g. `score: calcScore(input.data)`) or a ruleset (e.g. `decision: risk(age: applicant.age)`), is treated like
   any other computed field and grouped under `[vars]` instead — decision tables come from `[dt]` declarations, not
   from the calls made against them.
6. **Ordering**: Within a context, groups always render in this fixed order: `[types]`, `[vars]`, then the
   individual `[ctx]` / `[func]` / `[dt]` entries in the order they appear in the underlying Portable JSON (i.e.
   source/document order, not alphabetical).

### Error Handling

`get(path, filter?)` can still return a `PortableError` for `EntryNotFound`/`WrongFieldPath` (the path itself doesn't
resolve). It no longer does so for a **linking** reason: as of the engine's linking-contract rework
(`../edgerules-v2/doc/LINKING_FIX.md`), a CRUD edit that leaves the AST dirty degrades every path — not just the
broken one — to a raw, type-free projection instead (no error, no `readOnly`/inferred-type info, just the authored
shape); `MutableDecisionService.link()` is the only call that still throws a precise, path-scoped diagnosis, and it
isn't exposed through `ProjectExplorerService` today. Practically: a `[ctx]` node whose subtree doesn't currently
link keeps expanding and rendering its (now-untyped) children rather than getting stuck as an errored leaf — there
is no engine signal left for this component to show an error badge/tooltip on. When building a node's children, if
the underlying `get` call returns a genuine `PortableError` (a structural path problem, not linking):

- Render the affected node with an error indicator (e.g. an error badge on the icon) instead of failing to render
  the tree.
- Surface `PortableError.message` (and `location`, when present) in a tooltip on that node.
- Do not expand further into a node that errored — treat it as a leaf until the underlying model is fixed and the
  path resolves again.

### Technical Details

- https://mui.com/x/react-tree-view/ will be used to render the tree view.