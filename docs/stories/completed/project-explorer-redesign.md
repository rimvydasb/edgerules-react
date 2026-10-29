# Project Explorer

User can define various service methods that have strict IO boundaries and can be invoked from workbook or later, be
deployed in the EdgeRules cloud runtime as a real service. User's can create Workbooks to use merhods and service
methods here and now to see how they act as well as add new tests.

## Structure

Project Explorer must have the following sections:

- [x] **Types** - all EdgeRules defined types are stored here
- [x] **Methods** - all available project elements that re not types or pure root expressions are stored here, such as
      functions, rulesets, services, etc.
- [x] **Variables** - all root expressions
- [x] **Workbooks** - these are expressions that are annotated with `@Workbook`. I can expand workbook and see inputs,
      outputs, charts, etc.
- [x] **Tests** - all tests user has created that can be opened by tests' manager.

> Clarification: Methods lists every function, `@Service` function and ruleset at any depth, by qualified path, for
> example `applicant.calculateAge()`. It does not look inside a function body or a workbook.

> Clarification: Variables lists every other root field, contexts included. A workbook lists its direct fields with a
> Flow Component annotation (`@InputNode`, `@FunctionNode`, `@OutputNode`, `@ChartNode`) as its nodes.

> Clarification: Each section lists its entries by name. The engine projection of `get('*')` does not keep the source
> order.

## Restrictions

- [x] user cannot create charts, inputs and outputs as methods - these entities are available for workbooks only.

> Clarification: The add menu of Methods offers Function, Service and Ruleset only. The Flow Editor of a workbook
> creates input, output and chart nodes.

## Controls

- [x] User should have an ability to create any type, workbook, etc.
- [x] Anything clicked on `Types`, `Variables` or `Methods` opens Boxed Editor by default.
- [x] `Workbooks` clicked opens Flow Editor by default. User can expand Workbook to see all nodes. Each clicked node
      opens Boxed Editor by default.
- [x] `Tests` clicked opens Test Editor by default (no other view option available).
- [x] Shell should respect all paths.

> Clarification: Each section header has an add button. It asks for the name of a new type, method, variable or
> workbook, writes the smallest valid entity with `service.set`, and opens it. The add button of Tests adds a test case
> to the chosen subject: the model or a method.

> Clarification: A click keeps the active view when that view can show the entry. In the Flow view, a workbook node
> opens the canvas of its workbook and centers the node. The default views apply from a view that cannot show the entry.

> Clarification: The Project Explorer panel is below the Shell header row.

> Clarification: The Shell accepts the path of every entity as a root path, also a type or a plain value. The Flow view
> is disabled for a root path without Flow. See [shell-spec.md](../specs/shell-spec.md).

## Open Questions

1. The Flow Editor palette offers input, output and chart nodes at every Flow root, also outside a workbook. Must the
   palette hide them outside a workbook?
2. A new test always starts as one empty test case. Must the add button of Tests open the existing tests of a subject
   instead of adding a case?
