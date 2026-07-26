# Boxed Editor Specification

This document is the authoritative specification for the `BoxedEditor` implementation at
[`src/components/boxed-editor`](../src/components/boxed-editor): a single flat treegrid GUI language, fully described
below. [`BOXED_EDITOR_OLD_SPEC.md`](BOXED_EDITOR_OLD_SPEC.md) is not authoritative for this component — everything
needed to implement `BoxedEditor` is in this document.

- GUI Reference Frames `/Users/rimvydasbingelis/Projects/EdgeRules/edgerules-react-frames/src` — this is the
  authoritative wireframe. Every row layout, column, action list, and interaction described below is a direct read of
  that code (`App.tsx` for composition/occupancy, `boxed/actions.ts` for row kinds and their context menus,
  `boxed/*.tsx` for per-construct rendering, `hooks/useAltHeld.ts` for the type-reveal interaction).
- ![reference.png](screenshots/reference.png)
- Actions with Icons: `/Users/rimvydasbingelis/Projects/EdgeRules/edgerules-react-frames/src/boxed/actions.ts`

## Introduction

`BoxedEditor` is the structured, visual authoring surface for EdgeRules models. The interaction model is influenced by
the boxed-expression and decision-modeling experiences of **Camunda** and **Trisotech**, and by the **Decision Model and
Notation (DMN)** standard. EdgeRules `BoxedEditor` does not strictly follow standard DMN boxed expression GUI
conventions and proposes much more convenient and compact layouts and ergonomics.

`BoxedEditor` renders a single flat treegrid of rows. Every row is one of the `BoxedRowKind`s below (this is the
complete list — derived from, and cross-checked against, the reference wireframe's `RowKind` union in
[`boxed/actions.ts`](/Users/rimvydasbingelis/Projects/EdgeRules/edgerules-react-frames/src/boxed/actions.ts)):

- `model` - the model header: name, occupies the whole top row, fixed position
- `field` - **the one generic leaf row.** Depending on its parent it is a class field definition, a typed input, or a
  plain computed/literal expression — all three render identically and share the same actions. See
  [Row kind consolidation](#row-kind-consolidation).
- `context` - named nested object that can contain other rows
- `complexType` - named, reusable type definition that can contain other `field` rows
- `list` - header of a homogeneous scalar list; no header cells of its own beyond name/value
- `list-item` - single scalar item of a list
- `relation` - header of a homogeneous complex-object collection; carries the column names (one per shared field)
- `relation-item` - single record of a relation, one cell per relation column
- `function` - a named callable (`func`); tall row, argument headers under the value column
- `function-result` - the synthesized `result` line of a function body
- `ruleset` - a named rule matrix (DMN-style decision table, EdgeRules `ruleset`); tall row, condition/action column
  headers under the value column.
  See [Ruleset and optimisation row composition](#ruleset-and-optimisation-row-composition).
- `rule` - one row of a `ruleset`'s rule matrix
- `ruleset-default` - the singleton fallback-result row of a `ruleset` (shown when no rule matches)
- `optimisation` - a named linear optimisation problem (EdgeRules `optimise`); tall row, argument headers under the
  value column. See [Ruleset and optimisation row composition](#ruleset-and-optimisation-row-composition).
- `optimisation-variable-group` - the fixed `variables:` section header inside an `optimisation`
- `optimisation-variable` - one decision variable (a Typed Input Wrapper)
- `optimisation-objective` - the fixed `maximise`/`minimise` row (exactly one, required)
- `optimisation-constraint-group` - the fixed `constraints:` section header inside an `optimisation`
- `optimisation-constraint` - one named linear constraint
- `ruleset-hit-policy` - the fixed `hitPolicy` setting row of a `ruleset`
- `optimisation-setting` - the fixed `using` / `bottlenecks` / `timeLimit` setting rows of an `optimisation`

### Row kind consolidation

A class field (`name: <string, required: true>` under a `complexType`), a typed input
(`applicationDate: <date, required: true>` under a `context`), and a plain computed expression
(`payment: monthly(application.amount)` at the model root) all render through the exact same `Row` component with the
exact same action list (`convert-to-context` / `convert-to-relation` / `convert-to-list`, `duplicate`, `delete`) — only
the parent container differs. `BoxedRowKind` therefore has a single `field` kind for all of them, rather than a
separate kind per parent context.

### Row Types

Full-height ("tall", 80px) rows carry their own argument/column headers in the `ValueColumn`: `function`, `ruleset`,
`optimisation`, and `model`. Everything else is single-height (40px) and grows only in 40px steps if it needs to wrap.
Exact column occupancy (which rows span `NameColumn`+`ValueColumn` as one cell vs. keep them separate) is not repeated
here — read it straight from `App.tsx`, which is the living reference for every row's layout.

| Row Type                      | Row Type Key                    | Actions                                                                                                           | Short Description                                                                    |
| ----------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Model Header                  | `model`                         | Add Field, Add Function, Add Optimisation, Add Decision Table, Add Relation, Add List, Model Settings             | Root row: model name; fixed position, not sortable, not deletable                    |
| Type Field                    | `field`                         | Convert to Context, Convert to Relation, Convert to List, Duplicate, Delete                                       | Generic leaf: a class field, a typed input, or a computed expression                 |
| Context                       | `context`                       | Add Field, Add Function, Add Decision Table, Add Relation, Add List, Duplicate, Delete, Expand/Collapse           | Named nested object                                                                  |
| Complex Type                  | `complexType`                   | Add Field, Duplicate, Delete, Expand/Collapse                                                                     | Reusable named type definition                                                       |
| List                          | `list`                          | Duplicate, Delete                                                                                                 | Header of a homogeneous scalar list; items appended via the trailing placeholder row |
| List Item                     | `list-item`                     | Duplicate, Delete                                                                                                 | One scalar list element; Duplicate inserts a copy directly below it                  |
| Relation                      | `relation`                      | Add Column, Delete "‹column›" Column (per column), Delete                                                         | Header of a homogeneous complex-object collection                                    |
| Relation Item                 | `relation-item`                 | Duplicate, Delete                                                                                                 | One record of a relation, one cell per column                                        |
| Function                      | `function`                      | Add Argument, Duplicate, Delete "‹arg›" Argument (per arg), Delete, Expand/Collapse                               | A named callable (`func`)                                                            |
| Function Result               | `function-result`               | Duplicate, Delete                                                                                                 | The synthesized `result` line of a function body; not draggable                      |
| Decision Table                | `ruleset`                       | Add Rule, Add Condition Column, Add Action Column, Delete "‹column›" Column (per column), Delete, Expand/Collapse | A named rule matrix (DMN-style decision table)                                       |
| Rule                          | `rule`                          | Duplicate, Delete                                                                                                 | One row of a decision table's rule matrix                                            |
| Ruleset Default               | `ruleset-default`               | Delete                                                                                                            | Singleton fallback row shown when no rule matches; not duplicable                    |
| Ruleset Hit Policy            | `ruleset-hit-policy`            | _(none — edited via its own picker chip)_                                                                         | Fixed `hitPolicy` setting                                                            |
| Optimisation                  | `optimisation`                  | Duplicate, Delete, Expand/Collapse                                                                                | A named linear optimisation problem (`optimise`)                                     |
| Optimisation Variable Group   | `optimisation-variable-group`   | Add Variable                                                                                                      | Fixed `variables:` section header; not draggable                                     |
| Optimisation Variable         | `optimisation-variable`         | Duplicate, Delete                                                                                                 | One decision variable (a Typed Input Wrapper)                                        |
| Optimisation Objective        | `optimisation-objective`        | Switch to Minimise/Maximise                                                                                       | Fixed `maximise`/`minimise` row; exactly one, required; not draggable                |
| Optimisation Constraint Group | `optimisation-constraint-group` | Add Constraint                                                                                                    | Fixed `constraints:` section header; not draggable                                   |
| Optimisation Constraint       | `optimisation-constraint`       | Duplicate, Delete                                                                                                 | One named linear constraint                                                          |
| Optimisation Setting          | `optimisation-setting`          | _(none — edited via its own control)_                                                                             | Fixed `using` / `bottlenecks` / `timeLimit` settings                                 |

**Common to every row:**

- Description column
- Test-results column
- Action column (context menu content differs per row kind — see [Context Menu](#context-menu))

**Not draggable / not sortable:** `model` (fixed root), `function-result` (synthesized), `ruleset-default` (singleton),
`ruleset-hit-policy`, `optimisation-variable-group`, `optimisation-objective`, `optimisation-constraint-group`,
`optimisation-setting` (all fixed, single-value or section-header settings rendered via the `SettingRow` primitive with
a gear icon instead of a drag handle — see `primitives.tsx`'s `SettingRow` doc comment in the wireframe).

**Drag and Drop:** the function icon, the ruleset icon, the optimisation icon, the type icon, and the 6-dot expression
drag handle are all drag handles for the row and its children.

### Ruleset and optimisation row composition

`ruleset` and `optimisation` are the two row kinds whose children are a fixed shape rather than a freely-ordered
container — the diagram below is the structural reference for both (row order, and which children are fixed vs.
repeatable, matches this exactly):

```mermaid
flowchart TD
    subgraph Ruleset["ruleset — tall row: parameters + condition/action column headers"]
        direction TB
        Rule1["rule (repeatable, sortable)"]
        Rule2["rule (repeatable, sortable)"]
        RuleNew["(new rule) placeholder"]
        Default["ruleset-default — absent when hitPolicy is collect-matches"]
        HitPolicy["ruleset-hit-policy — fixed, not draggable"]
    end

    subgraph Optimisation["optimisation — tall row: parameters"]
        direction TB
        Using["optimisation-setting: using — fixed"]
        Bottlenecks["optimisation-setting: bottlenecks — fixed"]
        VarGroup["optimisation-variable-group — fixed section header"]
        Var1["optimisation-variable (repeatable, sortable)"]
        Var2["optimisation-variable (repeatable, sortable)"]
        VarNew["(new variable) placeholder"]
        Objective["optimisation-objective — fixed, exactly one"]
        ConGroup["optimisation-constraint-group — fixed section header"]
        Con1["optimisation-constraint (repeatable, sortable)"]
        Con2["optimisation-constraint (repeatable, sortable)"]
        ConNew["(new constraint) placeholder"]
        TimeLimit["optimisation-setting: timeLimit — fixed"]
        VarGroup --> Var1 & Var2 & VarNew
        ConGroup --> Con1 & Con2 & ConNew
    end
```

**Ruleset relationship to the standalone Decision Table Editor:** `../edgerules-react/src/components/decision-table`
already ships a dedicated `DecisionTableEditor` (full MUI table, dialogs, column management). This spec's inline
`ruleset` rendering above is a **compact, fully-editable-in-place view**, not a preview — it has real add-rule /
add-column / delete-column actions, matching how `relation`/`list` are already edited in place without needing to
"open" anything. The existing `onOpenNode({kind: 'ruleset'})` routing to `DecisionTableEditor` is kept as an escape
hatch for the dedicated full-screen ergonomics (bulk column resize, keyboard cell navigation, large rule counts) —
symmetric with how `code-editor` stays available via "View as code" even though expression cells are already editable
inline (see [Resolved Decisions](#resolved-decisions) #13).

**Optimisation has no standalone editor at all.** Unlike `ruleset`, there is no dedicated host editor for `optimise`
anywhere in the library's component list (Code Editor, Boxed Editor, Decision Table Editor, Flow Editor, Test Runner,
Types Editor, Project Explorer) — `BoxedEditor` is its only GUI, so the inline row tree above must be complete on its
own, not a preview.

## GUI Language

`BoxedEditor` has a strict spacing policy:

- single smallest `cell` is 40x40 pixels
- if row needs to contain more lines, it can grow vertically by the step of 40 pixels: 80, 120, 160...
- if row cell needs to be longer, it can only grow by the step of 40 pixels: 80, 120, 160...
- all text on the cell is positioned in the middle
- all cells are aligned with each other, no mid-positioning or pixel offsets are allowed. In general, all BoxedEditor
  GUI can be sketched on school maths workbook.

`BoxedEditor` is composed of rows where each row can be an expression, function definition, decision table, list
header, list row, etc. `BoxedEditor` has the following main columns:

- `NameColumn` - grid-based column, can contain many cells that can be skipped to display the different depth of
  JSON-like context tree.
- `ValueColumn` - column is used for expression value, function/ruleset/optimisation argument headers, list items,
  relation cells, rule cells, etc.
- `DescriptionColumn` - column is used for description, can be empty
- `ActionsColumn` - column is used for context menu button: vertical three dots icon in a single `cell`
- `TestResultsColumn` - column is used for that single expression calculation result. This column has a header with a
  test name and with `previous` and `next` buttons to navigate through all test cases.

Every type is a tooltip on its owning name/header cell (`NameColumn` for a `field`/`context`/`complexType`,
argument/column headers for `function`/`ruleset`/`optimisation`/`relation`), revealed two ways:

- **Hover** a name/header cell → its tooltip opens, showing that one type.
- **Hold Alt** anywhere on the page → every type tooltip in the tree opens at once, so the whole model's types can be
  scanned without hovering row by row. Releasing Alt (or the window losing focus) closes them all again.

This is implemented in the wireframe by a page-level `AltHeldContext` (`useAltHeldState` listens for `keydown`/`keyup`
on `"Alt"` and `blur`) that every `TypeName`-wrapped cell reads alongside its own local hover state — see
`hooks/useAltHeld.ts` and `boxed/primitives.tsx`'s `TypeName`.

## Component Tree

Root: `src/components/boxed-editor`. This is a tree, not a flat file list — indentation is ownership/nesting, and
each line is that file's one job. Naming continues this repo's existing conventions (the current implementation
already has `boxes/`, `primitives/`, `actions/`; this spec renames the row-construct folder to `rows/` since the
wireframe's GUI is treegrid rows, not nested DMN boxes, and drops the type-chip primitive since there is no type
column to render a chip for).

```
src/components/boxed-editor/
├─ index.ts                          — public exports only (see Component API's export-surface note)
├─ BoxedEditor.tsx                   — root component: validates `path`, renders BoxedEditorContext/UiContext
│                                       providers, the header row (if showHeader), and the root row list
├─ BoxedEditorProps.ts               — BoxedEditorProps, BoxedEditorOpenTarget, BoxedEditorTargetKind (public)
├─ boxed-editor-types.ts             — BoxedEditorService, BoxedRowData, BoxedRowKind, SignatureParameter (public)
├─ service/
│  ├─ createBoxedEditorService.ts    — factory: MutableDecisionService -> BoxedEditorService
│  ├─ normalize.ts                   — Portable -> BoxedRowData[] (Normalization Rules: sort order, relation
│  │                                    vs. list classification, metadata stripping)
│  ├─ denormalize.ts                 — BoxedRowData -> PortableNode (inverse of normalize.ts)
│  └─ rowCache.ts                    — per-path memoized row arrays backing useSyncExternalStore (Resolved
│                                       Decision #6); invalidated wholesale when `revision` changes
├─ context/
│  ├─ BoxedEditorContext.tsx         — seeds service/languageService/readOnly/column-visibility from props
│  └─ BoxedEditorUiContext.tsx       — ephemeral UI state: per-row expand/collapse, active editing cell path,
│                                       Alt-held (type-reveal), current test-case index
├─ hooks/
│  ├─ useBoxedEditorService.ts       — reads BoxedEditorContext
│  ├─ useBoxedRows.ts                — useSyncExternalStore(service.subscribe, () => service.getBoxedRowsData(path))
│  ├─ useDescription.ts              — subscribes to DocumentationService for one path
│  ├─ useTestCases.ts                — ordered cases + current index + next()/prev() from UiContext
│  ├─ useTestResult.ts               — current test case's TestCasesService result for one path
│  ├─ useAltHeld.ts                  — global Alt-key listener feeding BoxedEditorUiContext
│  └─ useRowActions.ts               — resolves a BoxedRowKind's menu items (mirrors the wireframe's
│                                       rowActionRegistry/rowActions) into dispatchable commands
├─ rows/                             — one component per BoxedRowKind, each a thin wrapper over primitives/RowLine
│  ├─ ModelHeaderRow.tsx             — kind: model
│  ├─ FieldRow.tsx                  — kind: field
│  ├─ ContextRow.tsx                — kind: context
│  ├─ ComplexTypeRow.tsx            — kind: complexType
│  ├─ ListRow.tsx                   — kind: list
│  ├─ ListItemRow.tsx               — kind: list-item
│  ├─ RelationRow.tsx               — kind: relation (renders its own column-header sub-grid)
│  ├─ RelationItemRow.tsx           — kind: relation-item
│  ├─ FunctionRow.tsx               — kind: function (renders ArgumentHeaders); + FunctionResultRow child
│  ├─ FunctionResultRow.tsx         — kind: function-result
│  ├─ RulesetRow.tsx                — kind: ruleset (renders ArgumentHeaders + two-group column headers)
│  ├─ RuleRow.tsx                   — kind: rule
│  ├─ RulesetDefaultRow.tsx         — kind: ruleset-default
│  ├─ RulesetHitPolicyRow.tsx       — kind: ruleset-hit-policy
│  ├─ OptimisationRow.tsx           — kind: optimisation (renders ArgumentHeaders)
│  ├─ OptimisationSettingRow.tsx    — kind: optimisation-setting (using / bottlenecks / timeLimit)
│  ├─ OptimisationVariableGroupRow.tsx — kind: optimisation-variable-group
│  ├─ OptimisationVariableRow.tsx   — kind: optimisation-variable
│  ├─ OptimisationObjectiveRow.tsx  — kind: optimisation-objective
│  ├─ OptimisationConstraintGroupRow.tsx — kind: optimisation-constraint-group
│  ├─ OptimisationConstraintRow.tsx — kind: optimisation-constraint
│  ├─ NewRow.tsx                    — the trailing "(new …)" placeholder row shared by every appendable container
│  └─ RowSwitch.tsx                 — BoxedRowData.kind -> the matching row component (the one big dispatch point)
├─ cells/
│  ├─ ExpressionCell.tsx            — the ValueColumn cell; enforces the one-active-editor invariant, swaps
│  │                                    between static text and CodeEditorCell for the active path
│  ├─ DescriptionCell.tsx           — reads useDescription(path); no-op read-only when no service is provided
│  └─ TestResultCell.tsx            — reads useTestResult(path); owns array/number/date display formatting
├─ primitives/
│  ├─ RowLine.tsx, Cell.tsx         — shared row chrome (ported ~1:1 from the wireframe's primitives.tsx)
│  ├─ TypeName.tsx                 — hover tooltip + Alt-held-reveal wrapper (reads useAltHeld)
│  ├─ Drag.tsx, ColumnDragHandle.tsx, TallIconHandle.tsx — drag-handle affordances
│  ├─ SettingRow.tsx               — fixed, non-reorderable construct-level row (gear icon, optional kind/menu)
│  ├─ DropdownChip.tsx             — the picker-style chip for hitPolicy / using / bottlenecks
│  └─ ArgumentHeaders.tsx          — the two-row (label + cells) argument/column header block shared by
│                                     function / ruleset / optimisation / relation headers
├─ menu/
│  ├─ actions.ts                   — RowKind, RowAction, rowActionRegistry, rowActions (internal; not exported —
│  │                                  see the review above before treating this 1:1 as final)
│  ├─ RowActionsMenu.tsx           — the MUI Menu, shared by the normal-height and tall-row three-dot buttons
│  └─ useRowMenu.ts                — anchorEl open/close state
├─ dnd/
│  ├─ useRowDrag.ts                — drag source wiring for the function/ruleset/optimisation/type icons and
│  │                                  the 6-dot handle; suppressed under readOnly (Resolved Decision #4)
│  ├─ useRowDrop.ts                — drop-target wiring; delegates validity to dropRules.ts
│  └─ dropRules.ts                 — pure function encoding Valid drop targets (below); shared by drag preview
│                                     and the actual move() call so they can never disagree
└─ __tests__/
   ├─ BoxedEditor.test.tsx         — root rendering, fatal vs. path-scoped errors, readOnly
   ├─ row-kinds.test.tsx           — one case per BoxedRowKind (including ruleset/optimisation families)
   ├─ alt-reveal.test.tsx          — hover vs. Alt-held type tooltip behavior
   ├─ dnd.test.tsx                 — reorder + reparent, including the ruleset/optimisation exceptions
   ├─ duplicate-rename.test.tsx    — auto-rename on Duplicate for every named kind (review item R5)
   └─ normalization.test.ts        — sort order, relation-vs-list classification, metadata stripping
```

## Component API

The package entry point is `edgerules-react/boxed-editor`. Its public API is intentionally small:

```ts
interface BoxedEditorProps {
  service: BoxedEditorService; // The mutable EdgeRules model authority. The editor never maintains a second persisted model.
  path: string; // The authored CRUD path to show. Use `"*"` for the complete model.
  languageService?: CodeEditorService; // Supplies diagnostics and completions to the one active expression cell.
  revision?: string | number; // Host-controlled invalidation token. Change it after model edits made outside this editor.
  readOnly?: boolean; // Disables name/value editing and ordering while retaining navigation and visible ordering handles.
  onChange?: (snapshot: PortableRootContext) => void; // Called once with the refreshed Portable snapshot after a successful committed mutation.
  onOpenNode?: (target: BoxedEditorOpenTarget) => void; // Routes specialized nodes to another host editor; `BoxedEditor` does not implement those editors.
  showHeader?: boolean; // Whether to show the model header row. Defaults to `true`.
  showTestResults?: boolean; // Whether to show the test results column. Defaults to `true`.
  showDescription?: boolean; // Whether to show the description column. Defaults to `true`.
  showType?: boolean; // Whether the type tooltip (hover + Alt-reveal, see GUI Language) is available. Defaults to `true`.
  expanded?: boolean; // Whether to expand all rows (types, contexts, functions, rulesets, optimisations). Defaults to `true`.
  className?: string; // Optional class name for the root element.
  sx?: SxProps<Theme>; // Optional MUI `sx` prop for styling the root element.
}
```

**Notes:**

- `onOpenNode` routes specialized nodes to their host editors.

```ts
type BoxedEditorTargetKind =
  'type-definition' | 'ruleset' | 'loop' | 'boxed-editor' | 'code-editor';

interface BoxedEditorOpenTarget {
  path: string;
  kind: BoxedEditorTargetKind;
}
```

`type-definition`, `ruleset`, and `loop` route to their specialized host editors (Types / Decision Table / Loop).
`boxed-editor` asks the host to open the target context in its own nested `BoxedEditor` instance, and `code-editor`
backs the `View as code` action (opens the CodeMirror editor on the model text). The host owns those editor
instances; `BoxedEditor` only emits the routing request — a `code-editor` target carries just the `path`, and
resolving that into actual code text or a rendered editor is entirely the host's responsibility, not `BoxedEditor`'s.
`ruleset` is the one target kind whose node is _also_ fully
editable inline (see [Ruleset and optimisation row composition](#ruleset-and-optimisation-row-composition)) — opening it
is for the dedicated full-screen
ergonomics, not because the inline view is read-only. `optimise` is edited exclusively inline, through `BoxedEditor`'s
own `optimisation`-family rows — it carries no entry in `BoxedEditorTargetKind`.

- `expanded` sets the **initial** global expand state only. After first render each `FunctionRow` / `ContextRow` /
  `ComplexTypeRow` / `RulesetRow` / `OptimisationRow` keeps its own expand/collapse state, toggled by its own
  `Expand` / `Collapse` context-menu action (see [Context Menu](#context-menu)). Changing `revision` does not reset
  per-row expand state.
- **Export surface.** The `boxed-editor` entry point exports `BoxedEditor`, `BoxedEditorProps`, `BoxedEditorService`,
  `BoxedEditorOpenTarget`, `BoxedEditorTargetKind`, `createBoxedEditorService`, and the row data types (`BoxedRowData`,
  `BoxedRowKind`, `BoxedTableRowData`, `SignatureParameter`). The row data types are exported because
  `BoxedEditorService`'s own methods return them — without the export, a consumer outside this package could not
  name the return type of `getBoxedRowsData`. `DocumentationService` and `TestCasesService` are **not** re-exported
  here: a host imports them directly from `edgerules-react/documentation-service` and `edgerules-react/test-cases-service`
  and passes an instance in as a prop, the same way `TestsManager` does (`TESTS_MANAGER_STORY.md`'s Component API) —
  one contract, one place it's defined. Rows, cells, primitives, hooks, contexts, and normalization internals are
  **not** re-exported either — they are not public API.

## Context Menu

Which actions a row kind offers is already in the [Row Types](#row-types) table's Actions column. This section
defines what each action does; a "per instance" action (e.g. one Delete-column entry per existing column) appears
once here and is repeated once per instance in the actual menu.

| Action                                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete                                      | Deletes the selected row. Hidden/disabled when `BoxedRowData.deletable` is `false` (e.g. a function's synthesized `result`, `ruleset-default`, or a field required by the model).                                                                                                                                                                                                                                                                                           |
| Duplicate                                   | Copies the row — and, for a container, all its children — and inserts the copy directly below the original. Auto-renames on a **named** kind (`field`, `context`, `complexType`, `function`, `optimisation`, `optimisation-variable`, `optimisation-constraint`) to avoid an immediate collision with the source's own name; a **positional** kind (`list-item`, `relation-item`, `rule`) needs no rename, so Duplicate doubles as "insert a new one right after this one". |
| Model Settings                              | Opens a form for model-level metadata (name, version, description). Whether `View as code` also lives here is unresolved — see [Open Questions](#open-questions) #1.                                                                                                                                                                                                                                                                                                        |
| Add Field                                   | Appends a new `field` row to the container (`model`, `context`, `complexType`).                                                                                                                                                                                                                                                                                                                                                                                             |
| Add Function                                | Appends a new `function` row to the container (`model`, `context`).                                                                                                                                                                                                                                                                                                                                                                                                         |
| Add Decision Table                          | Appends a new `ruleset` row to the container (`model`, `context`).                                                                                                                                                                                                                                                                                                                                                                                                          |
| Add Optimisation                            | Appends a new `optimisation` row. **`model` only** — `optimise` may only be declared at the model root; a nested declaration is a link-time error (`OPTIMISATION_METAPHOR_SPEC.md` §3, "Root-only. Like `external func`").                                                                                                                                                                                                                                                  |
| Add Relation                                | Appends a new `relation` row to the container (`model`, `context`).                                                                                                                                                                                                                                                                                                                                                                                                         |
| Add List                                    | Appends a new `list` row to the container (`model`, `context`).                                                                                                                                                                                                                                                                                                                                                                                                             |
| Add Item                                    | Appends a new `list-item` row to a `list`.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Add Row                                     | Appends a new `relation-item` row to a `relation`.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Add Argument                                | Appends a new argument to a `function`'s signature.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Delete "‹argument›" Argument (per argument) | Removes that argument from a `function`'s signature.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Add Rule                                    | Appends a new `rule` row to a `ruleset`'s rule matrix.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Add Condition Column                        | Appends a new condition column to a `ruleset`, extending every `rule`/`ruleset-default` row.                                                                                                                                                                                                                                                                                                                                                                                |
| Add Action Column                           | Appends a new action column to a `ruleset`, extending every `rule`/`ruleset-default` row.                                                                                                                                                                                                                                                                                                                                                                                   |
| Add Column                                  | Appends a new field/column to every record in a `relation`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Delete "‹column›" Column (per column)       | Removes that column from every row (a `relation`'s records, or a `ruleset`'s `rule`/`ruleset-default` rows).                                                                                                                                                                                                                                                                                                                                                                |
| Add Variable                                | Appends a new `optimisation-variable` row to an `optimisation-variable-group`.                                                                                                                                                                                                                                                                                                                                                                                              |
| Add Constraint                              | Appends a new `optimisation-constraint` row to an `optimisation-constraint-group`.                                                                                                                                                                                                                                                                                                                                                                                          |
| Convert to Context                          | Converts a `field` into an empty `context`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Convert to Relation                         | Converts a `field` into an empty `relation`.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Convert to List                             | Converts a `field` into an empty `list`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Switch to Minimise / Maximise               | Flips an `optimisation-objective`'s section keyword, keeping the expression unchanged.                                                                                                                                                                                                                                                                                                                                                                                      |
| Expand / Collapse                           | Toggles whether the row's children are shown, on `function`, `context`, `complexType`, `ruleset`, and `optimisation` (a Material UI expand/collapse icon marks the current state).                                                                                                                                                                                                                                                                                          |

**Enablement rules:**

- All add-actions insert at the position implied by their name (a child at the end of the container, or a sibling
  directly below the selected row) and then re-apply the [Normalization Rules](#normalization-rules) sort order.
- In `readOnly` mode every mutating action is hidden; only `Duplicate` and the view toggles remain — `Duplicate`
  itself is a copy, so it does not mutate the source.

## Special Actions

- When the user clears an argument's name, the argument is removed from the `function`/`ruleset`/`optimisation`
  signature.
- When the user clears an expression's name while its value is also empty, the `field` is removed from its context.

### Append placeholders

Every appendable container also renders a trailing placeholder row — interacting with it appends a new row of the
listed kind without opening the context menu:

| Container Kind                               | Placeholder Row Kind      | Label              |
| -------------------------------------------- | ------------------------- | ------------------ |
| `model` (root), `context`, `function` (body) | `field`                   | "(new item)"       |
| `complexType`                                | `field`                   | "(new field)"      |
| `list`                                       | `list-item`               | "(new item)"       |
| `relation`                                   | `relation-item`           | "(new row)"        |
| `ruleset`                                    | `rule`                    | "(new rule)"       |
| `optimisation-variable-group`                | `optimisation-variable`   | "(new variable)"   |
| `optimisation-constraint-group`              | `optimisation-constraint` | "(new constraint)" |

## Drag and Drop

Handles: the function icon, the ruleset icon, the optimisation icon, the type icon, and the 6-dot handle each drag
their whole row **and its children** (a `function`/`ruleset`/`optimisation` carries its body, a `context`/`complexType`
its inner rows, a `list`/`relation` its items).
Dragging maps to `move(fromPath, toParentPath, index)`.

Valid drop targets (a drop outside these is rejected, the row snaps back):

- **Reorder within the same parent** is always allowed for sortable rows.
- **Reparent** is allowed only into a container that accepts the dragged `kind`: `field` (as a `complexType` child) →
  only a `complexType`; `list-item` → only a `list` (matching element type); `relation-item` → only a `relation` with
  matching columns; `rule` → only its own `ruleset`, and only as a reorder (rules never move between rulesets);
  `optimisation-variable` → only its own `optimisation`'s `optimisation-variable-group`; `optimisation-constraint` →
  only its own `optimisation`'s `optimisation-constraint-group`; `field` (as a context child) / `context` /
  `complexType` / `list` / `relation` / `function` / `ruleset` / `optimisation` → any `context` or the model root.
- The synthesized `result` row of a function, and every fixed setting row (`ruleset-default`, `ruleset-hit-policy`,
  `optimisation-variable-group`, `optimisation-objective`, `optimisation-constraint-group`, `optimisation-setting`),
  is not draggable.
- After the drop the destination re-applies the [Normalization Rules](#normalization-rules) sort order, and the
  editor calls `renamePath(from, to)` on the overlay services for every path that changed.

## Normalization Rules

### From EdgeRules DSL to BoxedEditor

1. Inline functions will have a `result` field.
2. All context elements are re-sorted in this order: `Types` (`complexType`), `Functions` (`function`), `Decision
Tables` (`ruleset`), `Optimisations` (`optimisation`), everything else (`context`/`list`/`relation`/`field`), with
   the synthesized `result` field of a function body sorted to the bottom. This order is read directly off the
   wireframe's `App.tsx` composition (Applicant type → monthly/creditScore functions → risk ruleset →
   factoryProduction optimisation → application context → reviewStages list → relations → plain expressions).

### From BoxedEditor to EdgeRules DSL

1. Single `result` field functions are collapsed to inline functions.
2. All context elements are re-sorted using the same order as above.

### Relation vs. list classification

A CRUD-addressable array normalizes to one of two row shapes depending on its item type:

| Dimension           | List                                    | Relation                                                                                                                                                       |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item shape          | scalar                                  | complex object (context)                                                                                                                                       |
| Header row kind     | `list`                                  | `relation`                                                                                                                                                     |
| Item row kind       | `list-item`                             | `relation-item`                                                                                                                                                |
| Header's `columns`  | n/a                                     | the ordered union of every field seen across all records, in first-authored-appearance order; Portable metadata keys (`@kind`, `@node`, ...) are never columns |
| Item's cell mapping | one `value` per item                    | one `cells[i]` per column, aligned to the header's `columns`                                                                                                   |
| Heterogeneous items | n/a — every item shares one scalar type | a record missing a field renders an **empty cell** for that column, never a nested field row                                                                   |

A computed, non-CRUD-addressable array (e.g. a `for … return …` loop) is neither a list nor a relation: it renders as
a single `field` row showing its result summary. Loops have no distinct `BoxedRowKind` — the loop text is opaque
expression content, like any other scalar expression (see [Cell value mapping](#cell-value-mapping)).

### Metadata handling

Portable metadata (`@kind`, `@description`, `@node`, `@node-name`, `@model-name`, `@model-version`) is never rendered
as a child row. The `model` row presents the applicable model metadata; on any mutation the facade must preserve
metadata unrelated to the edit. (Note the `@description` interaction called out in [Open Questions](#open-questions).)

## Service composition

The editor reads from **three independent, path-keyed data sources**. Keeping them separate is deliberate: only the
first is derived from the authored model, the other two are volatile authoring overlays stored in IndexedDB
(outside the EdgeRules DSL). Separating them also keeps test-case navigation and description edits from invalidating
the structural row tree — see [React integration](#react-integration).

Furthermore, each `BoxedEditorService` boxed editor data change will invoke EdgeRules decision service re-calculation,
but test cases navigation or description update will not trigger re-calculations.

| Source                 | Owns                                        | Keyed by | Storage                          | Feeds                       |
| ---------------------- | ------------------------------------------- | -------- | -------------------------------- | --------------------------- |
| `BoxedEditorService`   | Portable-derived structure (`BoxedRowData`) | `path`   | the authored model (via engine)  | Name/Value/description cols |
| `DocumentationService` | free-text descriptions                      | `path`   | IndexedDB (by model name + path) | DescriptionColumn           |
| `TestCasesService` (`edgerules-react/test-cases-service`) | executed test cases and their results | `path` (subject-relative; `qualifyPath` derives the fully qualified form used to look up a `BoxedRowData`'s path) | IndexedDB (`testCases`/`testResults` stores, by model + subject) | TestResultsColumn |

`BoxedEditorService` is the single facade for the model. It is a **normalizing adapter** over the authoritative
`MutableDecisionService` (from `@edgerules/web` / `@edgerules/node`); it holds no second persisted model. It does
**not** fold descriptions or test results into rows — those overlays are read directly by their column cells, so a
`BoxedRowData` stays a pure projection of the Portable model.

```mermaid
classDiagram
    class BoxedEditor {
        <<Reactcomponent>>
        +props BoxedEditorProps
    }
    class BoxedEditorService {
        <<facadeoverMutableDecisionService>>
        +getBoxedRowsData(path) BoxedRowData[]
        +getBoxedRowData(path) BoxedRowData?
        +setBoxedRowData(path, row) PortableNode|PortableError
        +remove(path) void|PortableError
        +rename(path, newName) void|PortableError
        +move(fromPath, toParentPath, index) void|PortableError
        +subscribe(listener) Unsubscribe
        +toPortable() PortableRootContext
    }
    class MutableDecisionService {
        <<engine>>
        +get(path, filter?) PortableNode|PortableError
        +set(path, node) PortableNode|PortableError
        +remove(path) void|PortableError
        +rename(path, newName) void|PortableError
    }
    class DocumentationService {
        <<IndexedDBoverlay>>
        +getDescription(path) string?
        +setDescription(path, text) void
        +renamePath(from, to) void
    }
    class TestCasesService {
        <<IndexedDBoverlay,from edgerules-react/test-cases-service>>
        +listTestCases() TestCase[]
        +getResultSet(testCaseId) TestResultSet?
        +renamePath(from, to) void
        +subscribe(listener) Unsubscribe
    }

    BoxedEditor --> BoxedEditorService: rows + commits (structure)
    BoxedEditor --> DocumentationService: DescriptionColumn cells
    BoxedEditor --> TestCasesService: TestResultsColumn cells
    BoxedEditorService --> MutableDecisionService: get / set / remove / rename
```

## `BoxedEditorService` API

`BoxedEditorService` returns `BoxedRowData` that contains all normalized data from the EdgeRules Portable.
`BoxedRowData` is also used to convert edited data back to Portable to persist to the underlying
`MutableDecisionService`. The facade is constructed with the mutable service and is the model's only surface;
descriptions and test results are separate overlays (above) and are not wired into it.

```typescript
type Unsubscribe = () => void;

interface BoxedEditorService {
  // --- Normalized read ---
  // Children rows of the context/container at `path`, already normalized and sorted
  // (see Normalization Rules). Pass `"*"` for the whole model.
  getBoxedRowsData(path: string): BoxedRowData[];

  // A single row (without materializing its children). Returns `undefined` if the path is absent.
  getBoxedRowData(path: string): BoxedRowData | undefined;

  // --- Mutation (denormalizes the row to Portable, delegates to the mutable service) ---
  setBoxedRowData(
    path: string,
    row: BoxedRowData,
  ): PortableNode | PortableError;

  remove(path: string): void | PortableError;

  rename(path: string, newName: string): void | PortableError;

  // Drag & drop reorder / reparent. `index` is the target position among the destination's children.
  move(
    fromPath: string,
    toParentPath: string,
    index: number,
  ): void | PortableError;

  // --- Reactivity ---
  // Notifies after any internal mutation commits, and after `invalidate()`, so the view can re-read via
  // useSyncExternalStore.
  subscribe(listener: () => void): Unsubscribe;

  // Drops cached normalized rows for `path` (and its ancestors), or the whole cache when `path` is omitted, and
  // notifies `subscribe` listeners. Call this after mutating the underlying `MutableDecisionService` through a
  // surface other than this facade's own methods — e.g. a co-mounted Flow Editor (ReactFlow) editing the same
  // model — so `BoxedEditorService`'s cache does not go stale. `BoxedEditorProps.revision` (the future React
  // layer's host-controlled invalidation token) is expected to call this on change; the service itself has no
  // notion of `revision`.
  invalidate(path?: string): void;

  // --- Escape hatch ---
  toPortable(): PortableRootContext;
}
```

`BoxedRowData` is the normalized, render-ready shape common to every row. Row kinds whose rendering needs argument
headers, columns, or per-column cells extend it with `BoxedTableRowData` instead of growing the common shape — this
keeps "does this row have tabular structure" a single, explicit type-level question instead of an ever-growing set of
optional fields on every row.

```typescript
type BoxedRowKind =
  | 'model'
  | 'field'
  | 'context'
  | 'complexType'
  | 'list'
  | 'list-item'
  | 'relation'
  | 'relation-item'
  | 'function'
  | 'function-result'
  | 'ruleset'
  | 'rule'
  | 'ruleset-default'
  | 'ruleset-hit-policy'
  | 'optimisation'
  | 'optimisation-setting'
  | 'optimisation-variable-group'
  | 'optimisation-variable'
  | 'optimisation-objective'
  | 'optimisation-constraint-group'
  | 'optimisation-constraint';

interface BoxedRowData {
  kind: BoxedRowKind; // Discriminant that selects the row renderer and its context menu.
  depth: number; // Depth within the context tree (dot count in `path`); drives NameColumn indent cells.
  path: string; // Fully qualified path used for get / set / remove / rename / move.
  name: string; // NameColumn label. Generated `Item N` for list-item/relation-item rows, `Rule N` for rule rows
  // unless the rule carries an authored `name` (rules are the one row kind whose generated name is
  // just a fallback — RULESET_METAPHOR_SPEC's `name?` field on a rule row is user-settable).
  value?: string; // ValueColumn content (expression text, list value, type constraint, objective/constraint expression, ...).
  type?: string; // The tooltip shown on hover / Alt-held; omitted for unnamed complex objects (see GUI Language).
  readOnly?: boolean; // Engine-marked read-only (e.g. synthesized `result`, linked type).
  deletable?: boolean; // Whether the Delete action is offered (defaults to true when omitted).
  children?: BoxedRowData[]; // Nested rows (context / function / ruleset / optimisation / type / list / relation bodies).
}

// Extends BoxedRowData with the fields needed by rows that carry argument headers, table columns, or per-column
// cells. A row's `kind` alone determines whether it's actually a BoxedTableRowData — see the list below.
interface BoxedTableRowData extends BoxedRowData {
  parameters?: SignatureParameter[]; // Argument headers: function / ruleset / optimisation.
  columns?: string[]; // Relation table header column names: relation.
  cells?: string[]; // Per-column values aligned to the parent's `columns`: relation-item.
  conditionColumns?: string[]; // Condition column names: ruleset.
  actionColumns?: string[]; // Action column names: ruleset.
  conditions?: string[]; // Per-condition-column unary-test cells (the cell-map `when` form), aligned to
  // `conditionColumns`; empty string means "any": rule. Mutually exclusive with `conditionsExpression`.
  conditionsExpression?: string; // `when` authored as a single boolean expression over the ruleset's parameters
  // (RULESETS_REFERENCE.md § "when as a boolean expression") instead of per-column
  // cells: rule. When set, the row renders one cell spanning every condition column
  // instead of one cell per column. Mutually exclusive with `conditions`.
  actions?: string[]; // Per-action-column cells, aligned to `actionColumns`: rule, ruleset-default.
  priority?: number; // Explicit rank, shown and editable only while the parent ruleset's hit policy is
  // `"best-match"` (required there, absent/rejected under every other hit policy): rule.
}

// One argument-header cell of a function / ruleset / optimisation signature. Order matches `@parameters`'
// key-insertion order (Portable's `@parameters` is a plain object, and JS/JSON preserve string-key order).
interface SignatureParameter {
  name: string; // Parameter name; the header cell label.
  type?: string; // Tooltip text (hover / Alt-held), same TypeName treatment as a field's `type`; omitted when the
  // `@parameters` entry is `null` (an untyped/unannotated parameter).
  required?: boolean; // From a `PortableTypedValue` parameter's `required`; absent for a bare type-reference or
  // untyped (`null`) parameter.
}
```

- **Plain `BoxedRowData`:** `model`, `field`, `context`, `complexType`, `list`, `list-item`, `function-result`,
  `ruleset-hit-policy`, `optimisation-setting`, `optimisation-variable-group`, `optimisation-variable`,
  `optimisation-objective`, `optimisation-constraint-group`, `optimisation-constraint`.
- **`BoxedTableRowData`:** `function` and `optimisation` (`parameters`), `relation` (`columns`), `relation-item`
  (`cells`), `ruleset` (`parameters`, `conditionColumns`, `actionColumns`), `rule` (`conditions`/`conditionsExpression`,
  `actions`, `priority`), `ruleset-default` (`actions`).

**Why `description` and `testResults` are not on `BoxedRowData`**: baking them into the row tree
would (a) force the tree to re-derive whenever a description is edited or the user clicks previous/next on test
cases, defeating memoization, and (b) blur the boundary between authored model and authoring metadata. Instead the
`DescriptionColumn` and `TestResultsColumn` cells read their own value by `path` from the respective service:

- `useDescription(path)` → `DocumentationService.getDescription(path)`
- `useTestResult(path)` → the current test case's result for `path`

The structural row tree keyed by `path` stays stable; navigating test cases only re-renders the small result cells,
never the boxes. See [React integration](#react-integration).

### Cell value mapping

`value`/`conditions`/`actions`/`cells` are the editable DSL text of one cell, produced by the facade from the
Portable node and sent back verbatim on commit (the engine re-parses it). This is the only Portable↔text boundary;
the view never parses DSL itself.

| Portable node                                  | `kind`                          | Cell text                                                                                                                               |
| ---------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| expression / scalar                            | `field`                         | its authored DSL text (`amount / 12`)                                                                                                   |
| typed input (`@kind: "type"`)                  | `field`                         | a type constraint, e.g. `<number, required: true>`                                                                                      |
| invocation (`@kind: "invocation"`)             | `field`                         | the call text, e.g. `monthly(application.amount)`                                                                                       |
| computed array / loop (`for … return …`)       | `field`                         | the raw loop text; never expands into item rows                                                                                         |
| list item                                      | `list-item` (`value`)           | the item's DSL literal (`'Underwriting'`)                                                                                               |
| relation cell                                  | `relation-item` (in `cells`)    | the field's DSL literal, per column                                                                                                     |
| ruleset condition cell (`when`, cell-map form) | `rule` (in `conditions`)        | the unary test literal, e.g. `18..25`, `< 30000`; empty = "any"                                                                         |
| ruleset condition, boolean-expression form     | `rule` (`conditionsExpression`) | one spanning cell holding the whole `when` expression, e.g. `age >= 18 and income < 30000`                                              |
| ruleset action cell (`then`)                   | `rule` (in `actions`)           | the output field's DSL literal, e.g. `"high"`, `1000`                                                                                   |
| ruleset rule priority                          | `rule` (`priority`)             | an integer, editable only under `hitPolicy: "best-match"`                                                                               |
| ruleset default cell                           | `ruleset-default` (`actions`)   | the fallback output field's DSL literal; the row itself is absent when `hitPolicy` is `"collect-matches"` (`default` is rejected there) |
| ruleset `hitPolicy`                            | `ruleset-hit-policy`            | `"first-match"` \| `"unique-match"` \| `"collect-matches"` \| `"best-match"`                                                            |
| optimise decision variable                     | `optimisation-variable`         | a Typed Input Wrapper, e.g. `<number, integer: true, min: 0>`                                                                           |
| optimise objective                             | `optimisation-objective`        | the linear expression, e.g. `15 * chairs + 40 * tables`                                                                                 |
| optimise constraint                            | `optimisation-constraint`       | the named linear comparison, e.g. `1 * chairs + 3 * tables <= workers`                                                                  |
| optimise `using` / `bottlenecks` / `timeLimit` | `optimisation-setting`          | the literal enum/boolean/number, e.g. `"highs"`, `true`, `1000`                                                                         |

A `RelationItemRow` cell whose value is itself a complex object is a drill-down, not a scalar cell: it renders nested
rows rather than JSON text. An invocation is a single, non-expandable expression cell — editing the call (method or
arguments) edits its `value` text.

Engine representation exception: when a whole `complexType` is persisted, its typed child text is written as the
raw wrapper string (for example `"<number, required: true>"`) rather than an `@kind: "expression"` object. The
installed engine accepts and parses the string form; `PortableTypeDefinition` intentionally permits a
`PortableTypedValue` or type-ref string, not a computed `PortableExpression`.

### Path conventions

Paths are the engine's CRUD paths — do not invent UI-only paths. `"*"` is the model root; context fields use dot
paths (`application.amount`); collection items use indexes (`applicants[0]`); function/ruleset/optimisation bodies
are addressed through their authored field path (`monthly.result`, `risk.rules[2].then.limit`,
`factoryProduction.variables.chairs`) even though Portable stores function bodies under `@body`. Authoritative
syntax and filters live in `../edgerules-v2/doc/architecture/CRUD_SPEC.md`.

`0.0.1-alpha.202607252017` exposes the authored `PortableOptimiseDefinition` through
`get(optimiseName, "ALL")` and accepts it through whole-definition `set`, `remove`, and `rename`. Optimisation child
paths above remain editor row identities rather than engine CRUD locations: the facade merges a child edit,
remove, rename, or move into the owning definition and writes that definition once, as required by the engine API.

### Edit → persist → refresh flow

Every committed edit follows the same path: the view denormalizes the changed row, the facade delegates to the
mutable service, then a fresh normalized snapshot is read back and `onChange` fires once.

```mermaid
sequenceDiagram
    participant User
    participant BoxedEditor
    participant BoxedEditorService
    participant MutableDecisionService as MutableDecisionService (engine)
    User ->> BoxedEditor: edit cell / drag row / menu action
    BoxedEditor ->> BoxedEditorService: setBoxedRowData(path, row) / move / remove / rename
    BoxedEditorService ->> BoxedEditorService: denormalize row → PortableNode (Normalization Rules)
    BoxedEditorService ->> MutableDecisionService: set / remove / rename(path, ...)
    alt PortableError
        MutableDecisionService -->> BoxedEditorService: PortableError
        BoxedEditorService -->> BoxedEditor: PortableError (edit rejected, cell keeps focus)
    else success
        MutableDecisionService -->> BoxedEditorService: PortableNode (linked, type-enriched)
        BoxedEditor ->> BoxedEditorService: getBoxedRowsData(path)
        BoxedEditorService -->> BoxedEditor: normalized BoxedRowData[]
        BoxedEditor ->> BoxedEditor: onChange(service.toPortable())
    end
```

## React integration

How the services are provided as hooks and where row state lives.

**Single source of truth — do not duplicate the model in React state.** The authored model lives behind the
`MutableDecisionService`; `BoxedEditorService` is a stateless-derivation facade over it. React stores **no copy of
the row tree**. Rows are _derived_ on demand and cached inside the facade, and components subscribe to that external
store with React 18's `useSyncExternalStore`. This keeps the spec's promise that "the editor never maintains a second
persisted model", and it is the idiomatic way to bind React to a mutable non-React store.

Two kinds of state, kept apart:

| State                                                                            | Owner                                                   | Lifetime            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------- |
| Model structure (rows)                                                           | `MutableDecisionService` (external, via facade cache)   | persisted           |
| Descriptions / test results                                                      | `DocumentationService` / `TestCasesService` (IndexedDB) | persisted (overlay) |
| UI state: per-row expand, active editing cell, Alt-held, current test-case index | React context (`BoxedEditorUiContext`)                  | ephemeral           |

**Providers and hooks** (the library's internal contract; only `BoxedEditor` is exported):

- The host constructs the services and passes the facade as the `service` prop — the mutable service is **host-owned**,
  so no `useMutableDecisionService` hook is needed inside the library. A `createBoxedEditorService(mutable)` factory is
  offered as a convenience; hosts that want a memoized instance wrap it in their own `useMemo`.
- `BoxedEditor` seeds a context from its props; the subtree reads through hooks:
  - `useBoxedEditorService()` → the facade.
  - `useBoxedRows(path)` → `useSyncExternalStore(service.subscribe, () => service.getBoxedRowsData(path))`.
  - `useDescription(path)` → subscribes to `DocumentationService` for that path.
  - `useTestCases()` → the ordered cases + current index + `next()`/`prev()` from `BoxedEditorUiContext`.
  - `useTestResult(path)` → the current case's result for `path` from `TestCasesService`.
  - `useAltHeld()` → whether Alt is currently held, from `BoxedEditorUiContext`.

```mermaid
flowchart TD
    Host[Host app] -->|service, path, revision| BoxedEditor
    subgraph Providers
        BoxedEditor --> Ctx[BoxedEditorContext + BoxedEditorUiContext]
    end
    Ctx --> Rows["useBoxedRows(path)"]
    Ctx --> Desc["useDescription(path)"]
    Ctx --> Res["useTestResult(path)"]
    Rows -->|useSyncExternalStore| Facade[BoxedEditorService]
    Desc --> DocSvc[DocumentationService]
    Res --> TestSvc[TestCasesService]
    Facade -->|subscribe / getSnapshot| Store[(derived-row cache)]
```

**Reactivity requirements** the implementation must honor:

- `getBoxedRowsData(path)` must return a **referentially stable** value when nothing under `path` changed (memoize
  per path), otherwise `useSyncExternalStore` re-renders on every tick or loops. A committed mutation produces a new
  reference only for the affected subtree.
- Internal edits call `subscribe` listeners after commit; **external** edits are signalled by changing the `revision`
  prop, on which the provider clears the facade cache and forces a re-read.
- Because descriptions and test results are separate stores, editing a description or pressing previous/next re-renders
  only the `DescriptionColumn` / `TestResultsColumn` cells for the affected paths — never the box rows.

> **Decided** (Resolved Decision #6): the `useSyncExternalStore` + facade-cache model is adopted over an
> immutable-snapshot reducer.

## Expression editing & language service

- **One active editor invariant.** At most one cell across the whole tree mounts the CodeMirror `CodeEditorCell` at a
  time; every other cell renders static text. `languageService` (a `CodeEditorService`) feeds diagnostics and
  completions to that single active cell only. The active cell path is UI state in `BoxedEditorUiContext`.
- **Model-scoped analysis (embedding).** A cell holds one expression, but it must be analyzed in the scope of the
  surrounding model so completions resolve sibling fields and types. The active cell wraps its text in a synthetic
  DSL prefix/suffix built from the current model and calls the language service on the whole document, then maps
  positions back into the cell. The existing `embedService` / `CodeEditorEmbedContext` (from
  `code-editor/language/service`) already implements this and is reused — the synthetic wrapper is never persisted.

## Error handling

Two error scopes, mirroring the reference behavior:

- **Fatal** — the selected `path` or its schema fails to load. The treegrid is replaced by an alert; nothing is
  editable. Typically a bad `path` prop or a corrupt model.
- **Path-scoped** — a `set`/`rename`/`remove`/`move` returns a `PortableError`, or a cell value fails to parse/link.
  The edit is rejected, the offending cell keeps focus and shows the message inline in its row; the rest of the tree
  stays interactive. A mutation can also succeed structurally while breaking a reference elsewhere in the model
  (`CRUD_SPEC.md`: "a type incompatibility or broken reference only surfaces as a `LinkerError`... on the _next_
  evaluation/get") — that broken reference is **not** rolled back (Resolved Decision #12); it surfaces later as its
  own path-scoped error, inline on whichever row is next read/evaluated at that path.

## `TestCasesService` API

Supplies the `TestResultsColumn`. `TestCasesService`, `TestCase`, `TestResultSet`, `TestResult`, and their sibling
types are defined and owned by [`TESTS_MANAGER_STORY.md`](TESTS_MANAGER_STORY.md#object-model)'s
`edgerules-react/test-cases-service` package — `BoxedEditor` imports them from there rather than declaring its own
copy, so the two components share one persistence contract instead of two independently-evolving ones. This spec
covers only how `BoxedEditor` **consumes** that package, never how it is implemented.

`TestCasesService` is a **read-only reader over IndexedDB** from `BoxedEditor`'s point of view: `TestsManager` (or any
other host-side execution surface) runs cases and writes their results there; `BoxedEditor` never runs the engine and
never imports `TestRunner`. The column header shows the current test case name and a `1/N` counter with
previous/next buttons — driven by the package's own `useTestCases` hook — and each row shows that case's computed
value on its own line, read per-path via the package's `useTestResult(service, testCaseId, path)`.

A `TestResultSet`'s `results` are keyed by **subject-relative** path; `BoxedEditor` renders fully qualified paths, so
a cell derives the lookup key with `qualifyPath(subjectId, path)` (also from `test-cases-service`) before reading its
`TestResult`. **`TestResult.value` is `unknown`, not a pre-formatted string** — the engine's real JS value (a
`number`, an `array`, a nested object, or the engine's string form for dates/durations/special values); see
[Resolved Decisions](#resolved-decisions) #5 and `TESTS_MANAGER_STORY.md`'s Resolved Decision #9 for why. `BoxedEditor`
owns all display formatting on top of it — arrays render as `N items`, long values are truncated, numbers/dates are
locale-formatted.

> Recomputation is the host's responsibility. When the model changes, the host's execution service (`TestRunner`, from
> `edgerules-react/tests-manager`, or an equivalent) re-runs its cases and writes `TestCasesService`, which notifies
> subscribers; `BoxedEditor`'s hooks re-render from that notification. `BoxedEditor` never triggers execution, keeping
> it free of any engine dependency. After a successful `rename`/`move`, the editor's command layer calls
> `TestCasesService.renamePath(from, to)` exactly as it does for `DocumentationService` — see [Resolved Decisions](#resolved-decisions)
> #7.

## `DocumentationService` API

Provides and persists the free-text description shown in the `DescriptionColumn`, keyed by fully qualified path.
Descriptions are authoring metadata that live **outside** the Portable model: they are stored in **IndexedDB keyed by
model name + path**. `DocumentationService` is the adapter that looks them up (or returns `undefined` when none exist)
and writes edits back.

```typescript
interface DocumentationService {
  getDescription(path: string): string | undefined; // Description for a path, or undefined when none is set.
  setDescription(path: string, description: string): void; // Persist an edited description (empty string clears it).
  renamePath(from: string, to: string): void; // Migrate the description entry when a node's path changes.
}
```

> Because descriptions are keyed only by `path`, a `rename`/`move` that changes a node's path would orphan its
> IndexedDB entry. After a successful `rename`/`move`, the editor's command layer calls `renamePath(from, to)` on both
> overlay services so descriptions and results follow the node. The `BoxedEditorService` facade stays decoupled from
> the overlays (Resolved Decision #1): it exposes the `{ from, to }` change (via the mutation result / `subscribe`
> notification) and the `BoxedEditor` component — which holds all three services — performs the migration.

When no `documentationService` is provided, the `DescriptionColumn` renders empty and its cells are read-only.

## Verification

Per project standards (`CLAUDE.md`), new components ship with RTL tests and a Storybook story, and tests run against
the **real** engine — never a mock.

- **RTL** (`__tests__/`) with a real `MutableDecisionService` from `@edgerules/node`: rendering at root and focused
  paths, every `BoxedRowKind` including the `ruleset`/`optimisation` families, the one-active-editor invariant, one
  `onChange` per successful commit, context / function / list / relation / type / ruleset / optimisation mutations,
  drag-drop reorder and reparent (including the ruleset/optimisation non-draggable exceptions), auto-rename on
  Duplicate for named kinds, hover vs. Alt-held type reveal, `renamePath` overlay migration, fatal vs. path-scoped
  errors, and `readOnly` behavior.
- **Storybook** stories covering the reference layout and host wiring (including `DocumentationService` /
  `TestCasesService` overlays, test-case navigation, a `ruleset`-bearing model, and an `optimisation`-bearing model).
- If a mutation or normalization exposes a WASM/DSL bug, append a reproducible entry to `docs/BUG_REPORTS.md` rather
  than compensating in React.

### Storybook stories

1. `BoxedEditor` with a full model (all row kinds) and a `DocumentationService` overlay.
2. `BoxedEditor` with a `TestCasesService` overlay and previous/next navigation.
3. `BoxedEditor` with a `ruleset`-bearing model, showing inline rule CRUD and `ruleset-hit-policy`/`ruleset-default`
   rows.
4. `BoxedEditor` with an `optimisation`-bearing model, showing inline variable/objective/constraint CRUD and
   `optimisation-setting`/`optimisation-variable-group` rows.
5. `BoxedEditor` with a `func` bearing model, showing inline and complex function overlays and editing. Function with no
   arguments and deeper nested functions will be there as well.

## Resolved Decisions

These were open in earlier iterations and are now settled; kept for traceability.

| #   | Decision                                         | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Enrichment-service wiring                        | Removed `testCasesService` / `documentationService` from `BoxedEditorProps`. Descriptions and test results are separate path-keyed overlays consumed via hooks, not folded into the facade or rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | `BoxedEditorService` layering                    | The facade is **constructed with** a `MutableDecisionService` (`createBoxedEditorService(mutable)`) and delegates internally. The component only ever sees `BoxedEditorService`. (Was Open Q "Option 1".)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 3   | `BoxedRowData` flat vs. union                    | Keep the **flat optional-field** interface; renderers read only the fields their `kind` uses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 4   | `readOnly` and drag handles                      | Handles stay **visible** — the function/ruleset/optimisation/type icons _are_ the drag handles and the 6-dot handle is a grouping cue — but drag is **suppressed** in `readOnly` (no drag cursor, `dragstart` blocked). Neither hidden nor greyed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | Result / value formatting                        | Services supply **raw engine serialization**; `BoxedEditor` owns all display formatting (array → `N items`, truncation, locale number/date formatting).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6   | React binding model                              | **`useSyncExternalStore` + facade cache** (rows re-derive lazily; only changed subtrees get new references) over an immutable-snapshot reducer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 7   | Overlay migration on move                        | `DocumentationService` and `TestCasesService` expose `renamePath(from, to)`. The editor command layer calls it after a successful `rename`/`move`; the facade stays overlay-agnostic and just surfaces the `{ from, to }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | Copy/Paste vs. Duplicate                         | Dropped the two-step clipboard `Copy` + `Paste Below` in favor of a single one-click `Duplicate` action (the wireframe's `rowActionRegistry` has no copy/paste ids at all). Named rows auto-rename on Duplicate — see [Context Menu](#context-menu)'s `Duplicate` entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 9   | Type disclosure                                  | Every type renders as a tooltip on its owning name/header cell, opened on hover or, for the whole tree at once, while **Alt** is held; `showType` gates that tooltip interaction (see [GUI Language](#gui-language)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10  | Descriptions storage                             | **Option 1**: descriptions stay an IndexedDB overlay via `DocumentationService`; `@description` metadata is left untouched for now. Folding descriptions into `@description` (portable export/import) is out of scope for this iteration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 11  | Large-collection strategy                        | **Option 1**: eager load for `getBoxedRowsData` — no paging/virtualization in this iteration. Windowed reads and a virtualized `RelationItemRow`/`RuleRow` are tracked as a [follow-up story](#follow-up-stories), not built now.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 12  | Linked-validation failures                       | **Option 1, with no rollback.** Per `CRUD_SPEC.md` ("CRUD writes can succeed structurally but fail to link... a broken reference only surfaces as a `LinkerError` on the _next_ evaluation/get"), `set`/`rename`/`remove` already return success even when they break a reference elsewhere — the facade does not re-validate or reverse the mutation. The broken reference then surfaces as an ordinary path-scoped error (see [Error handling](#error-handling)) wherever the affected path is next read/evaluated. A rollback-on-write policy was rejected deliberately: it would make renaming a field that's referenced elsewhere impossible, since the reference update always lands in a separate, later commit. |
| 13  | Ruleset inline editing vs. `DecisionTableEditor` | Both coexist: `BoxedEditor` implements full inline decision-table-style CRUD for `ruleset` rows (as this document's [Row Types](#row-types)/[Context Menu](#context-menu) specify), and the standalone `DecisionTableEditor` remains reachable via `onOpenNode({kind: 'ruleset'})`. The exact division of responsibility between the two is expected to be revisited in a later story.                                                                                                                                                                                                                                                                                                                                  |
| 14  | Expand/Collapse                                  | A context-menu `Expand`/`Collapse` toggle action (Material UI expand/collapse icon), offered on every collapsible container kind: `function`, `context`, `complexType`, `ruleset`, `optimisation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Follow-up Stories

Work items this spec deliberately defers rather than blocks on. Each needs its own story before being built.

- [ ] Paging / virtualization for large `list` / `relation` / `ruleset` bodies (`getBoxedRowsData(path, {offset,
limit})` plus virtualized `RelationItemRow` and `RuleRow` renderers) — see Resolved Decision #11.

## Open Questions

1. **Where does "View as code" live?** `BoxedEditorTargetKind` still includes `'code-editor'` for it, but the
   wireframe's `model` action list has no action for it (column-visibility toggling is fully covered by
   `BoxedEditorProps` — `showType`/`showDescription`/`showTestResults` — with no in-editor menu equivalent, which this
   spec treats as resolved).
   Question to address: "View as code" has nowhere obvious to live — where does it go?
   Option 1: fold it into the new `Model Settings` action's dialog.
   Option 2: promote it to a toolbar-level control outside any row's context menu, alongside the host chrome that
   already surrounds `BoxedEditor`.
   Option 3: drop it from this iteration; hosts that want a code view route through `onOpenNode({kind: 'code-editor'})`
   from elsewhere in their own chrome instead of from within `BoxedEditor`.

> Architect notes: "View as code" is for each knowledge element (func, ruleset, optimise) and model itself Context Menu
> option. For now, you do not need to worry where Code Editor gets the code.

2. **`ruleset` has no `Duplicate` action.** Every other named container kind (`function`, `context`, `complexType`,
   `optimisation`) offers `Duplicate`, but `ruleset`'s action list is `Add Rule`, `Add Condition Column`,
   `Add Action Column`, `Delete` only.
   Question to address: is omitting `Duplicate` on `ruleset` intentional (cloning a whole rule matrix might be
   considered too heavyweight/risky for a one-click action), or should it be added for consistency with the other
   named container kinds?
   Option 1: intentional — leave `ruleset` without `Duplicate`.
   Option 2: add `Duplicate` to `ruleset`, applying the same auto-rename rule as every other named kind.

> Architect notes: Option 2: add `Duplicate` to `ruleset`,

3. **`optimisation` has no `Add Argument` / `Delete Argument` actions.** `function` manages its signature through
   `Add Argument` and a per-argument `Delete Argument`, but `optimisation`'s action list is `Duplicate`, `Delete`
   only — there is currently no menu path to add or remove a parameter from an `optimise` element's signature.
   Question to address: is this a deliberate simplification (optimise signatures are fixed at creation), or a gap to
   close?
   Option 1: intentional — an `optimisation`'s parameters are set once, at creation, and not edited afterward through
   the menu.
   Option 2: add `Add Argument` / `Delete "‹argument›" Argument` to `optimisation`, matching `function`.

> Architect notes: Option 2: add `Add Argument` / `Delete "‹argument›" Argument` to `optimisation`, matching `function`.
