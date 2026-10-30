# Service Flow

As of now, service does not have a flow enabled - we need to enable flow to have a higher level view of service logic
flow. To do that we need to perform below tasks.

## Tasks

- [x] Same as `@Workbook` annotated contexts, `@Service` annotated contexts should have Flow enabled and viewable as
      default view.
- [x] Flow must show Service's parameters as input object nodes. However, node will be rendered on type (not on context
      object!) and no values can be edited. Design and add Input Parameter node type to the palette that will be
      applicable only to Service.
- [x] Add result node as well. Result node will render result context and users will be able to app values that matter
      and should be in result to the result node. Result node will be similar to output node in Workbook, but of course,
      not values will be rendered. Apply result section for `loanRepayment`

> Clarification: The Shell spec section "The Flow view of a service shows its parameters and its result" specifies the
> behavior. The result node is the `return` record of the service, annotated `@ResultNode`.
