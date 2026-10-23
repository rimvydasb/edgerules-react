# Model Decomposition

One EdgeRules model has three views: Code, Boxed Editor and Flow Editor. All views read and write the same Portable
model, so the user switches between views without conversion or data loss.

## Each View Renders a Different Part of the Model

| View         | Renders                                                                                           | Annotations                                                     |
| ------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Code         | Every `PortableContext`, as EdgeRules DSL code                                                    | Shown and editable as DSL annotations                           |
| Boxed Editor | Every `PortableContext`, as boxed expression rows, except `@ChartNode` and `@OutputNode` contexts | Read only to hide `@ChartNode` and `@OutputNode`; never written |
| Flow Editor  | Only the fields that have a Flow Component annotation                                             | Read and written                                                |

- **Flow Component annotation:** a field annotation with a value that ends with `Node`. In Portable, it is
  `@node: '<Name>Node'`, for example `@node: 'InputNode'`. The annotation name in a DSL path is `@<Name>Node`.
- **Optional `@node-name`:** the node title in the Flow Editor. The title falls back to the field name.
- **Flow node discovery:** the Flow Editor reads the direct fields of the opened context in field order. Each direct
  field with a Flow Component annotation is one node. The Flow Editor does not descend into a child context.

## Views Share One Model Without Conflict

- A Flow Component annotation is presentation metadata. It does not change the computed value of a field.
- An edit in the Code view or in the Boxed Editor MUST keep the annotations of the field. The engine `set` keeps
  annotations when the new node has none.
- The Flow Editor adds a field to the flow with an annotation write. "Remove from flow" removes `@node` and `@node-name`
  only, and the field stays in the model.
- React Flow positions and viewport are not model data. The `FlowMetadataStore` keeps them in `flow.json`.

## Sample Model

The Code view and the Boxed Editor show all fields of the sample model. `limit` is an invocation: with
`@node: 'FunctionNode'`, the Flow Editor shows it as a `FunctionNode`.

```edgerules
{
  type Customer: { name: <string>; income: <number, 0> }
  func riskScore(income: number): { score: income / 100 }
  applicant: {
    age: 21
    address: {
      city: "Vilnius"
      zip: "01100"
    }
  }
  limit: riskScore(applicant.age).score
}
```

## Model to GUI Mapping

| `@kind`             | Portable type                        | Description                           | Category   | Flow Component | Boxed Expression Component(s) | Annotations     |
| ------------------- | ------------------------------------ | ------------------------------------- | ---------- | -------------- | ----------------------------- | --------------- |
| `context`           | `PortableContext`                    | Model context with expressions        |            | `InputNode`    | `ContextRow`                  | `@InputNode`    |
| `context`           | `PortableContext`                    | TanStack Chart body { data, x, y }    |            | `ChartNode`    | Not Supported (Hidden)        | `@ChartNode`    |
| `context`           | `PortableContext`                    | Expressions to output                 |            | `OutputNode`   | Not Supported (Hidden)        | `@OutputNode`   |
| `type`              | `PortableTypedValue`                 | Types Holes                           |            | Not Supported  | `FieldRow`                    |                 |
| `type-definition`   | `PortableTypeDefinition`             | Type Definition                       | Definition |                | `ComplexTypeRow`              |                 |
| `function`          | `PortableFunctionDefinition`         | Function definition (metaphor)        | Definition |                | `FunctionRow`                 |                 |
| `external-function` | `PortableExternalFunctionDefinition` | External function definition          | Definition |                | `ExternalFunctionRow` TBC     |                 |
| `ruleset`           | `PortableRulesetDefinition`          | Ruleset metaphor                      | Definition |                | `RulesetRow`                  |                 |
| `loop`              | `PortableLoopDefinition`             | Loop metaphor                         | Definition |                | `LoopRow` TBC                 |                 |
| `optimise`          | `PortableOptimiseDefinition`         | Optimise metaphor                     | Definition |                | `OptimisationRow`             |                 |
| `expression`        | `PortableExpression`                 | Expression                            | Executable | Not Supported  | `FieldRow`                    |                 |
| `invocation`        | `PortableInvocationDefinition`       | Expression that only invokes function | Executable | `FunctionNode` | `FieldRow`                    | `@FunctionNode` |

- **Not Supported** - there's no such a plan to support it
- **Executable** - it is possible to invoke this entity, if correctly defined, it already has mapped inputs. Based on
  referential transparency, computed value is assigned to the variable.
- **Definition** - this is reusable side effect free definition asset

| `@kind`          | Portable type                   | Where it appears                               |
| ---------------- | ------------------------------- | ---------------------------------------------- |
| `input`          | `PortableInputEnvelope`         | Execute request envelope.                      |
| `result`         | `PortableResultEnvelope`        | Successful execution result envelope.          |
| `partial-result` | `PortablePartialResultEnvelope` | Partial execution result envelope.             |
| `error`          | `PortableError`                 | A structured error crossing the host boundary. |

### Clarifications

- The Code view and the Boxed Editor need no annotation to render a field.
- `ChartNode` and `OutputNode` contexts have no Boxed Expression Component, so the Boxed Editor hides them.
- A plain value such as `amount: 5` takes no annotation. A Flow Component is a context or an invocation only.
