# Service Flow

Service flow now has gaps, because expressions are ignored.

- [x] No gaps due to missing expression nodes will be in Workbook or Service. Always render expressions as expression
      nodes.
- [x] Create expression node to be displayed in the flow. The node will have 1 segment height header where field name is
      displayed. PortableExpression return should have `@variables`
  - [x] As usual, add icon on the left of header and context menu on the right.

## Implementation notes

- `FlowEditorService.listNodes()` lists every direct field of the flow context that is an expression or a literal and
  that no other node shows as an `expression` node. A `return` expression of a service is an expression node; a `return`
  record stays the result node.
- `getExpressionNode(field)` reads `get(field)`: the inferred `type`, the `expression` text and `@variables`. In a
  function body the engine infers no type, so the type is `any`.
- The input pin `in:*` takes one wire per variable. A variable deeper than any pin, such as `applicant.address.city`,
  wires from the nearest pin on its path (`applicant.address`). The wires follow the expression text: a wire cannot be
  dropped on the pin or deleted.
- An expression is always on the flow: the menu has no "Remove from flow" and no "Rename node". "Remove from flow" on a
  list or value input leaves the field on the flow as an expression node.
- Out of scope: a field that is a single function call without `@FunctionNode` (for example `total: count(people)`) is
  an `invocation`, not an expression, and is still not on the flow.
