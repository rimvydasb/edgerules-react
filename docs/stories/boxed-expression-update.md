# Boxed Expression Update

> http://127.0.0.1:6006/?path=/story/components-boxed-editor--test-cases-and-test-runner

## Problem

It is very unclear where to put "show description" and "show test column" buttons. The current design is confusing and
not intuitive.

## Old View

![img.png](img.png)

## Solution

- [ ] Existing top row where "Model" is displayed must be just one-step height. This row must be shown always on top of
  all Metaphors that are opened in Boxed Editor.
- [ ] Existing 3 dor vertical icon must be changed to `plus` icon, because it basically opens a context menu where you
  can add other Metaphors. This is applicable only to the root view of the whole Model as a Boxed Expression.
    - [ ] When I open a single expression or Metaphor as a Boxed Expression, then the `plus` icon must be hidden,
      because it is not applicable to add other Metaphors to a single expression. Simply leave the square empty.
- [ ] Add two more toggle buttons to the left of the `plus` icon. One is for "show description" and another is for "show
  test
  column". These buttons must be shown only when a Metaphor is opened as a Boxed Expression.
- [ ] Note that toggling description and test column must be applicable to all Metaphors that are opened as Boxed
  Expressions even to `http://127.0.0.1:6006/?path=/story/models-loan-repayment--decision-table`
- [ ] Per default "show description" is always on and "show test column" must be toggled off.
- [ ] When "show test column" is toggled on, then the test column must be shown and user should be able to school test
  cases as it can do today. However, make sure school left and school right buttons speak the same GUI language and are
  wrapped in a single cell of one step. The whole test column can be a little wider.

