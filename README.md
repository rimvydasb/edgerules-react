# EdgeRules Components

This repository defines reusable React components and hooks for building applications that integrate with the EdgeRules
decision engine. It includes:

- EdgeRules Code Editor
- EdgeRules Boxed Editor
- EdgeRules Decision Table Editor
- EdgeRules Flow Editor (ReactFlow-based)
- EdgeRules Test Runner
- EdgeRules Types Editor
- EdgeRules Project Explorer

## EdgeRules Project Explorer

Project explorer is a React component that allows users to view and manage EdgeRules projects. Project Explorer mimics
well known IDE's project explorers. However, since EdgeRules is basically a "code-first" system, the project explorer is
not a file system explorer. Instead, it is a view of the EdgeRules Portable Format.

The project explorer allows users to view the structure of the following EdgeRules project components:

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
           { when: { age: ... >= 18 and ... <= 25 }; then: { level: "high" } }
        ]; 
        default: { level: "none" } }
    )
}
```

Project Explorer display example as a tree view:

```text
.
├── [types] Types
├── [vars] Variables
├── [ctx] nested
│   └── [func] deep()
├── [dt] risk()

```

### Icons

- `[vars]` - Variables context (global or nested)
- `[ctx]` - Nested context
- `[func]` - Function context
- `[dt]` - Decision Table context

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

### Technical Details

- https://mui.com/x/react-tree-view/ will be used to render the tree view.