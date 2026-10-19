# Model Decomposition

EdgeRules Flow editor displays root invocations in the model, so:

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
|---------------------|--------------------------------------|---------------------------------------|------------|----------------|-------------------------------|-----------------|
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
|------------------|---------------------------------|------------------------------------------------|
| `input`          | `PortableInputEnvelope`         | Execute request envelope.                      |
| `result`         | `PortableResultEnvelope`        | Successful execution result envelope.          |
| `partial-result` | `PortablePartialResultEnvelope` | Partial execution result envelope.             |
| `error`          | `PortableError`                 | A structured error crossing the host boundary. |

### Clarifications

1. 