# Project Explorer

User can define various service methods that have strict IO boundaries and can be invoked from workbook or later, be
deployed in the EdgeRules cloud runtime as a real service. User's can create Workbooks to use merhods and service
methods here and now to see how they act as well as add new tests.

## Structure

Project Explorer must have the following sections:

- [ ] **Types** - all EdgeRules defined types are stored here
- [ ] **Methods** - all available project elements that re not types or pure root expressions are stored here, such as
  functions, rulesets, services, etc.
- [ ] **Variables** - all root expressions
- [ ] **Workbooks** - these are expressions that are annotated with `@Workbook`. I can expand workbook and see inputs,
  outputs, charts, etc.
- [ ] **Tests** - all tests user has created that can be opened by tests' manager.

## Restrictions

- [ ] user cannot create charts, inputs and outputs as methods - these entities are available for workbooks only.

## Controls

- [ ] User should have an ability to create any type, workbook, etc.
- [ ] Anything clicked on `Types`, `Variables` or `Methods` opens Boxed Editor by default.
- [ ] `Workbooks` clicked opens Flow Editor by default. User can expand Workbook to see all nodes. Each clicked node
  opens Boxed Editor by default.
- [ ] `Tests` clicked opens Test Editor by default (no other view option available).
- [ ] Shell should respect all paths.