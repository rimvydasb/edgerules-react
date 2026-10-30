# Service Flow

Service flow now has gaps, because expressions are ignored.

- [x] No gaps due to missing expression nodes will be in Workbook or Service. Always render expressions as expression
      nodes.
- [x] Create expression node to be displayed in the flow. The node will have 1 segment height header where field name is
      displayed. PortableExpression return should have `@variables`
  - [x] As usual, add icon on the left of header and context menu on the right.

## Implementation notes

- `FlowEditorService.listNodes()` lists every direct field of the flow context that is an expression or a literal and
  that no other node shows as an `expression` node. The `return` field of a service is never an expression node: it is
  the return node.
- `getExpressionNode(field)` reads `get(field)`: the inferred `type`, the `expression` text and `@variables`. In a
  function body the engine infers no type, so the type is `any`.
- The input pin `in:*` takes one wire per variable. A variable deeper than any pin, such as `applicant.address.city`,
  wires from the nearest pin on its path (`applicant.address`). The wires follow the expression text: a wire cannot be
  dropped on the pin or deleted.
- An expression is always on the flow: the menu has no "Remove from flow" and no "Rename node". "Remove from flow" on a
  list or value input leaves the field on the flow as an expression node.
- Out of scope: a field that is a single function call without `@FunctionNode` (for example `total: count(people)`) is
  an `invocation`, not an expression, and is still not on the flow.

## Return node and new expressions

- [x] The node of the `return` field is the Return node (it was the Result node). The annotation is `@ReturnNode`.
- [x] Any `return` field of a service is the Return node, with or without the annotation: a context or an expression.
- [x] The palette offers `Return` only while the service has no `return` field.
- [x] The palette offers `Expression` in the flow of a service and of a workbook.

### Implementation notes

- `getReturnNode(field)` reads a context as `fields`, and an expression as `expression`, `type` and `@variables`.
  `setReturnExpression(field, text)` edits the text of an expression `return`, link-checked; the annotation stays.
- The `@ReturnNode` annotation holds only the node name: `setNodeName` adds it, and an empty name removes it.
- The Return node is always on the flow: `removeFromFlow` refuses it, and its menu has no "Remove from flow". "Delete"
  removes the `return` field.
- `createReturnNode()` refuses an existing `return` field. It creates a `return` context with each value field of the
  body, so callers keep linking.
- `createExpressionNode()` adds the field `expression`, `expression2`, … with the expression `0` to the flow context.
- Out of scope: a service whose body is an expression, not a context, has no `return` field. The palette still offers
  `Return` and `Expression` there, and both are refused.
