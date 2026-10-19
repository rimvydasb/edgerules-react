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

| `@kind`             | Portable type                        | Description                           | Flow Component | Boxed Expression Component |
|---------------------|--------------------------------------|---------------------------------------|----------------|----------------------------|
| `context`           | `PortableContext`                    | Model context and sub-contexts        |                |                            |
| `type`              | `PortableTypedValue`                 | Types Holes                           |                |                            |
| `type-definition`   | `PortableTypeDefinition`             | Type Definition                       |                |                            |
| `function`          | `PortableFunctionDefinition`         | Function definition (metaphor)        |                |                            |
| `expression`        | `PortableExpression`                 | Expression                            |                |                            |
| `invocation`        | `PortableInvocationDefinition`       | Expression that only invokes function |                |                            |
| `external-function` | `PortableExternalFunctionDefinition` | External function definition          |                |                            |
| `ruleset`           | `PortableRulesetDefinition`          | Ruleset metaphor                      |                |                            |
| `loop`              | `PortableLoopDefinition`             | Loop metaphor                         |                |                            |
| `optimise`          | `PortableOptimiseDefinition`         | Optimise metaphor                     |                |                            |

| `@kind`          | Portable type                   | Where it appears                               |
|------------------|---------------------------------|------------------------------------------------|
| `input`          | `PortableInputEnvelope`         | Execute request envelope.                      |
| `result`         | `PortableResultEnvelope`        | Successful execution result envelope.          |
| `partial-result` | `PortablePartialResultEnvelope` | Partial execution result envelope.             |
| `error`          | `PortableError`                 | A structured error crossing the host boundary. |
