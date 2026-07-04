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
    risk: firstMatch({ 
        inputs: { age: 20 }; 
        rules: [
           { when: { age: 18..25 }; then: { level: "high" } }
        ]; 
        default: { level: "none" } }
    )
}
```

`risk` uses the `firstMatch` hit policy. EdgeRules has four decision-table hit policies — `firstMatch`, `uniqueMatch`,
`collectMatches`, `bestMatch` — all rendered with the same `[dt]` icon; the policy itself is only visible once the
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
5. **Decision Tables**: A context field is rendered as a Decision Table (`[dt]`) only when it is an invocation
   (`@kind: "invocation"`) whose `@method` is one of the four reserved hit-policy keywords — `firstMatch`,
   `uniqueMatch`, `collectMatches`, `bestMatch`. Any other invocation (a plain user-function call, e.g.
   `score: calcScore(input.data)`) is treated like any other computed field and grouped under `[vars]` instead.
6. **Ordering**: Within a context, groups always render in this fixed order: `[types]`, `[vars]`, then the
   individual `[ctx]` / `[func]` / `[dt]` entries in the order they appear in the underlying Portable JSON (i.e.
   source/document order, not alphabetical).

### Error Handling

`get(path, filter?)` can return a `PortableError` instead of a node — most commonly a `Linking` error, since a CRUD
edit can leave the AST dirty and only surface a broken reference or type mismatch the next time the model is
linked (see `EDGERULES_CRUD_SPEC.md`). When building a node's children, if the underlying `get` call returns a
`PortableError`:

- Render the affected node with an error indicator (e.g. an error badge on the icon) instead of failing to render
  the tree.
- Surface `PortableError.message` (and `location`, when present) in a tooltip on that node.
- Do not expand further into a node that errored — treat it as a leaf until the underlying model is fixed and the
  path resolves again.

### Technical Details

- https://mui.com/x/react-tree-view/ will be used to render the tree view.