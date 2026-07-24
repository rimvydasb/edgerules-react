# Boxed Editor Specification

A lot of complexities and poor design patterns where used in the current Boxed Editor
implementation: [BOXED_EDITOR_OLD_SPEC.md](BOXED_EDITOR_OLD_SPEC.md); [boxed-editor](../src/components/boxed-editor)
This document is a specification for the new Boxed Editor implementation that will implement GUI language and
state-of-the-art design patterns.

- GUI Reference Frames `/Users/rimvydasbingelis/Projects/EdgeRules/edgerules-react-frames/src`
- ![reference.png](/Users/rimvydasbingelis/Projects/EdgeRules/edgerules-react-frames/docs/reference.png)

## Introduction

`BoxedEditor` is the structured, visual authoring surface for EdgeRules models. The interaction model is influenced by
the boxed-expression and decision-modeling experiences of **Camunda** and **Trisotech**, and by the **Decision Model and
Notation (DMN)** standard. EdgeRules `BoxedEditor` does not strictly follow standard DMN boxed expression GUI
conventions and proposes much more convenient and compact layouts and ergonomics.

`BoxedEditor` allows visualizing:

- `ModelHeaderRow` - model name and description
- `ExpressionRow` - inputs and calculations
- `FunctionRow` - standard functions, loops and optimise functions
- `ListRow` - it is just a name of the function, list does not have a header
- `ListItemRow` - single item of the list
- `RelationsRow` - list of complex objects share same fields that are used to display column names in relation
  table header
- `ContextRow` - complex object that can contain other rows
- `ComplexTypeRow` - complex object that can contain other rows
- `TypeDefinitionRow` - class field definition row

### Common features

| Row Type          | Description   | Sortable (drag drop)        | Type                                         | Actions | Occupies `NameColumn` and `ValueColumn`                              |
|-------------------|---------------|-----------------------------|----------------------------------------------|---------|----------------------------------------------------------------------|
| ExpressionRow     | yes           | yes                         | derived only                                 | yes     | No                                                                   |
| FunctionRow       | yes           | yes (carries function body) | none or user specified                       | yes     | `NameColumn` for name, `ValueColumn` for args                        |
| ListRow           | yes           | yes (carries list items)    | derived from list or specified if list empty | yes     | Yes                                                                  |
| ListItemRow       | yes           | yes (in list)               | none (no need to repeat) *                   | yes     | `NameColumn` has generated `Item X`, `ValueColumn` is for list value |   
| RelationsRow      | yes           | yes (with all table)        | none                                         | yes     | `NameColumn` for name, `ValueColumn` for table header (column names) |
| RelationsItemRow  | yes           | yes (within table)          | none                                         | yes     | `NameColumn` has generated `Item X`,  `ValueColumn` for columns      |
| ContextRow        | yes           | yes (carries inner items)   | none                                         | yes     | Yes                                                                  |
| ComplexTypeRow    | yes           | yes (carries inner items)   | N/A                                          | yes     | Yes                                                                  |
| TypeDefinitionRow | yes           | yes                         | N/A                                          | yes     | No                                                                   |
| ModelHeaderRow    | no (occupies) | no (occupies)               | no (occupies)                                | yes     | Yes, occupies all with name                                          |

**Clarifications:**

(**) - Before `RelationsHeaderRow` there's always `ContextRow`, because as usual relationships are assigned to the
field.
(*) - lists are homogenous

**Common Columns for all row types:**

- Description column
- Action column (however, context menu content will be different for each row type)

**Drag and Drop:**

- Function icon, Type icon and 6 dot expression drag handler are all drag handles for the element, and it's childs.

## GUI Language

`BoxedEditor` has a strict spacing policy:

- single smallest `cell` is 40x40 pixels
- if row needs to contain more lines, it can grow vertically by the step of 40 pixels: 80, 120, 160...
- if row cell needs to be longer, it can only grow by the step of 40 pixels: 80, 120, 160...
- all text on the cell is positioned in the middle
- all cells are aligned with each other, no mid-positioning or pixel offsets are allowed. In general, all BoxedEditor
  GUI can be sketched on school maths workbook.

`BoxedEditor` is composed of rows where each row can be expression, function definition, list header, list row, etc.
`BoxedEditor` has following main columns:

- `NameColumn` - is grid based column, can contain many cells that can be skipped to display the different
  depth of JSON-like context tree.
- `ValueColumn` - column is used for expression value, function arguments, list items, relation cells, etc.
- `TypeColumn` - column is used for type chip, can be empty if type is unnamed complex object.
- `DescriptionColumn` - column is used for description, can be empty
- `ActionsColumn` - column is used for context menu button: vertical three dots icon in a single `cell`
- `TestResultsColumn` - column is used for that single expression calculation result. This column has a header with a
  test name and with `previous` and `next` buttons to navigate through all test cases.

## Component API

The package entry point is `edgerules-react/boxed-editor`. Its public API is intentionally small:

```ts
interface BoxedEditorProps {
    service: BoxedEditorService; // The mutable EdgeRules model authority. The editor never maintains a second persisted model.
    testCasesService?: TestCasesService; // Can provide executed test cases and their results for `TestResultsColumn`.
    documentationService?: DocumentationService; // For each fully qualified path can provide a or set description that will be used in `DescriptionColumn`.
    path: string; // The authored CRUD path to show. Use `"*"` for the complete model.
    languageService?: CodeEditorService; // Supplies diagnostics and completions to the one active expression cell.
    revision?: string | number; // Host-controlled invalidation token. Change it after model edits made outside this editor.
    readOnly?: boolean; // Disables name/value editing and ordering while retaining navigation and visible ordering handles.
    onChange?: (snapshot: PortableRootContext) => void; // Called once with the refreshed Portable snapshot after a successful committed mutation.
    onOpenNode?: (target: BoxedEditorOpenTarget) => void; // Routes specialized nodes to another host editor; `BoxedEditor` does not implement those editors.
    showHeader?: boolean; // Whether to show the model header row. Defaults to `true`.
    showTestResults?: boolean; // Whether to show the test results column. Defaults to `true`.
    showDescription?: boolean; // Whether to show the description column. Defaults to `true`.
    showType?: boolean; // Whether to show the type column. Defaults to `true`.
    expanded?: boolean; // Whether to expand all rows (types, contexts, function). Defaults to `true`.
    className?: string; // Optional class name for the root element.
    sx?: SxProps<Theme>; // Optional MUI `sx` prop for styling the root element.
}
```

## Context Menu

**Common:** (except ModelHeaderRow)

- Delete - deletes the selected node, if it is allowed to delete
- Copy - copies the selected row with all its children to the clipboard
- Paste Below - pastes the copied row with all its children below the selected row

`ExpressionRow`:

- Add Expression Below - adds new expression row to the context

`FunctionRow`

- Add argument - adds new argument to the function

`ModelHeaderRow`

- View types - shows or hides type column
- View description - shows or hides description column
- View test results - shows or hides test results column
- View as code - opens CodeMirror editor with the model code

`ModelHeaderRow`, `ContextRow`:

- Add Context - adds new context row to the context
- Add Function - adds new function row to the context
- Add List - adds new list row to the context
- Add Relation - adds new relation row to the context
- Add Complex Type - adds new complex type row to the context

`FunctionRow`, `ContextRow`, `ComplexTypeRow`:

- Expand / Collapse toggle - expands or collapses the row to show or hide its children

> TODO: need to finish this part

## Special Actions

- When user removes argument name, then argument is removed from function definition
- When user removes expression name and expression value is empty, then expression is removed from context

## Normalization Rules

### From EdgeRules DSL to BoxedEditor

1. Inline functions will have result field
2. All context elements are re-sorted by type in this order: `Types`, `Functions`, everything else. `result` field to
   the bottom.

### From BoxedEditor to EdgeRules DSL

1. Single `result` field functions are collapsed to inline functions
2. All context elements are re-sorted by type in this order: `Types`, `Functions`, everything else. `result` field to
   the bottom.

## `BoxedEditorService` API

> TODO: need to finish this part

```typescript
interface BoxedEditorService {
    setDescriptionService(descriptionService: DocumentationService): void;

    setTestCasesService(testCasesService: TestCasesService): void;

    getBoxedRowData(path: string): BoxedRowData | undefined;

    getBoxedRowsData(path: string): BoxedRowData[];

    // ... TBC
}
```

`BoxedEditorService` returns `BoxedRowData` that contains all normalized data from the EdgeRules Portable.
`BoxedRowData` is also used to convert edited DSL data to back to Portable to persist back to EdgeRules
`MutableDecisionService`.

```typescript
interface BoxedRowData {
    depth: number; // Depth of the item within the context tree. Basically calculated by counting dots in path.
    path: string; // Fully qualified path to the item within the context tree used for `get` and `set` operations.
    name: string; // for `NameColumn` 
    value?: string; // for `ValueColumn`
    type?: string; // for `TypeColumn`
    description?: string; // for `DescriptionColumn`
    testResults?: TestResult[]; // for `TestResultsColumn`
    children?: BoxedRowData[]; // for nested rows
}
```

## `TestCasesService` API

> TODO: need to finish this part

```typescript

```

## `DocumentationService` API

> TODO: need to finish this part

```typescript

```