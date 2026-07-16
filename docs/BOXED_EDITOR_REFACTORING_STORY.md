# Boxed Editor Domain-Component Refactoring Story

| Field                | Value                                      |
|----------------------|--------------------------------------------|
| Status               | Proposed                                   |
| Component            | `BoxedEditor`                              |
| Public package       | `edgerules-react/boxed-editor`             |
| Related specification | `docs/BOXED_EXPRESSIONS_EDITOR_STORY.md` |
| Last updated         | 2026-07-17                                 |

## 1. Purpose

Refactor `BoxedEditor` around the EdgeRules entities that users see and edit. The component hierarchy should make the
boxed-editor mental model visible in the codebase: contexts are rendered by context components, functions by function
components, lists by list components, and so on.

This is an architectural refactoring. It MUST preserve the public `BoxedEditor` API, engine contracts, authored model,
and existing user behavior unless a behavioral change is explicitly added to this story.

## 2. Problem statement

The current implementation has been separated into multiple files, but its central rendering model remains a universal
recursive row:

```text
BoxedEditor
└── BoxedNodeRow
    ├── switch-like value rendering for every node kind
    ├── switch-like actions for every node kind
    └── BoxedNodeRow[]
```

`BoxedNodeRow` receives one broad `BoxedNodeRowProps` contract containing editor state and operations for unrelated
entities. Consequently:

- a function renderer knows about list and relation operations;
- a list item receives function-signature and metadata operations;
- adding a node kind requires changing several condition chains in the same component;
- recursive prop forwarding obscures which dependencies a specific entity actually needs;
- visual layout, entity semantics, mutation commands, and editor state are coupled; and
- moving code into separate files reduces file size without sufficiently reducing cognitive load.

The large props interface is therefore not the desired abstraction. It exposes the dependency surface of the former
monolith rather than expressing the capabilities of a boxed entity.

## 3. Goals

- Make Portable/boxed entity kinds recognizable as dedicated React components.
- Give each component only the data and capabilities that apply to its entity.
- Keep the recursive node dispatcher small and declarative.
- Separate entity presentation from engine mutations and editor-wide state.
- Preserve one active `CodeEditorCell` across the complete editor.
- Preserve read-only behavior, errors, list paging, routing, and rollback semantics.
- Make new node kinds implementable without editing unrelated components.
- Keep internal architecture out of the npm public API.

## 4. Non-goals

- Redefining EdgeRules DSL, Portable nodes, or engine CRUD contracts.
- Introducing a second persisted boxed-editor model.
- Replacing `MutableDecisionService` as the model authority.
- Changing the public `BoxedEditorProps` API.
- Adding type, ruleset, or loop editing to `BoxedEditor`.
- Reimplementing engine parsing, linking, type inference, or validation in React.
- Creating generic components merely to reduce line counts.

## 5. Target mental model

```text
BoxedEditor
└── BoxedEditorProvider
    └── BoxedNode
        ├── ContextBox
        │   └── BoxedNode[]
        ├── FunctionBox
        │   ├── FunctionSignature
        │   └── BoxedNode body
        ├── ExternalFunctionBox
        ├── ExpressionBox
        │   └── ExpressionCell | CodeEditorCell
        ├── InputBox
        ├── InvocationBox
        │   └── InvocationArgumentBox[]
        ├── ListBox
        │   └── ListItemBox[]
        ├── RelationBox
        │   └── RelationRowBox[]
        └── EditorLinkBox
```

`BoxedNode` is a dispatcher, not a universal renderer. It chooses the dedicated component for a normalized
`BoxedRenderNode` and contains no entity-specific editing UI.

Conceptually:

```tsx
function BoxedNode({node}: {node: BoxedRenderNode}) {
    switch (node.kind) {
        case 'context': return <ContextBox node={node}/>;
        case 'function': return <FunctionBox node={node}/>;
        case 'external-function': return <ExternalFunctionBox node={node}/>;
        case 'expression': return <ExpressionBox node={node}/>;
        case 'input': return <InputBox node={node}/>;
        case 'invocation': return <InvocationBox node={node}/>;
        case 'list': return <ListBox node={node}/>;
        case 'relation': return <RelationBox node={node}/>;
        case 'editor-link': return <EditorLinkBox node={node}/>;
    }
}
```

The actual implementation MAY use a typed renderer map instead of a `switch`, provided exhaustiveness remains visible
and type checked.

## 6. Component ownership

| Component                     | Owns                                                               | Must not own                                      |
|-------------------------------|--------------------------------------------------------------------|---------------------------------------------------|
| `BoxedEditor`                 | Loading, fatal state, provider composition, public callbacks       | Entity-specific markup                            |
| `BoxedNode`                   | Exhaustive mapping from node kind to component                     | Actions, dialogs, or visual implementation        |
| `ContextBox`                  | Context header, expansion, child composition, field-add affordance | Function signatures or list operations            |
| `FunctionBox`                 | Function header, signature affordance, body composition            | Relation columns or ordinary field actions        |
| `ExternalFunctionBox`         | External signature and metadata affordances                        | Function body rendering                           |
| `ExpressionBox`               | Static expression display and activation of the active editor      | Structural mutations unrelated to its field       |
| `InputBox`                    | Typed-input display and input editing                              | Expression or collection editing                  |
| `InvocationBox`              | Method and argument presentation/editing                           | Function-definition editing                       |
| `InvocationArgumentBox`      | One positional or named argument expression                        | Invocation-wide method changes                    |
| `ListBox`                     | Collection header, paging, add-item affordance, item composition   | Relation-column semantics                         |
| `ListItemBox`                 | Item display, delete, duplicate, and reorder actions               | Function or context actions                       |
| `RelationBox`                 | Relation header, columns, paging, row composition                  | Generic list assumptions that lose relation shape |
| `RelationRowBox`             | Row fields and row-level actions                                   | Relation-wide column mutations                    |
| `EditorLinkBox`              | Route label and `onOpenNode` activation                            | Specialized editor implementation                 |
| `BoxedEditorDialogs` or forms | Entity-specific form UI delegated by the owning component          | Global rendering decisions                        |

Small shared visual primitives such as `BoxHeader`, `BoxActions`, `BoxTypeChip`, and `StaticExpression` MAY be used
when they remove genuine duplication. They MUST NOT become another universal component controlled by node-kind
conditionals.

## 7. State and command architecture

### 7.1 Editor-wide state

The editor provider owns state that must be coordinated across entity components:

- current authored snapshot and normalized render tree;
- expanded node identifiers;
- the single active expression path;
- fatal and path-scoped errors;
- list page sizes; and
- refresh/change notification after successful mutations.

### 7.2 Focused capabilities

Entity components obtain focused capabilities through internal hooks or small controller objects. Suggested boundaries:

```text
useBoxedEditorState()       read-only mode, snapshot, errors, expansion
useExpressionActions()     activate, commit, cancel
useFieldActions()          add, rename, duplicate, remove, metadata
useFunctionActions()       edit signature
useInvocationActions()     edit invocation and arguments
useListActions()           add, duplicate, remove, move, load more
useRelationActions()       add, rename, remove columns
useEditorNavigation()      open type, ruleset, or loop editor
```

These names are illustrative. The implementation SHOULD choose the smallest stable boundaries supported by actual
usage.

### 7.3 Dependency rule

A component MUST NOT receive or access a capability that its entity cannot use. In particular:

- `FunctionBox` MUST NOT depend on list or relation actions;
- `ExpressionBox` MUST NOT depend on signature actions;
- `ListItemBox` MUST NOT depend on context-field creation;
- `EditorLinkBox` MUST NOT depend on mutation commands; and
- read-only components MUST be renderable without constructing mutation controls.

Avoid replacing `BoxedNodeRowProps` with an equally broad context value. A context that exposes every command to every
component recreates the same coupling with less visible props.

## 8. Rendering and mutation boundaries

`BoxedRenderNode` remains the normalized rendering input unless a separate model change is justified. Normalization
MUST remain independent of React components.

Components issue semantic commands such as “rename field”, “save signature”, or “move list item”. Engine mechanics
remain in command/controller code:

```text
Entity component
    → focused semantic command
        → service.set / rename / remove
            → linked validation and rollback when required
                → refresh snapshot
                    → onChange once
```

Components MUST NOT independently duplicate rollback, refresh, or `PortableError` handling logic.

## 9. File organization

The final names MAY vary, but the directory should communicate the domain structure. A suggested layout is:

```text
src/components/boxed-editor/
├── BoxedEditor.tsx
├── BoxedEditorProvider.tsx
├── BoxedNode.tsx
├── boxes/
│   ├── ContextBox.tsx
│   ├── FunctionBox.tsx
│   ├── ExternalFunctionBox.tsx
│   ├── ExpressionBox.tsx
│   ├── InputBox.tsx
│   ├── InvocationBox.tsx
│   ├── InvocationArgumentBox.tsx
│   ├── ListBox.tsx
│   ├── ListItemBox.tsx
│   ├── RelationBox.tsx
│   ├── RelationRowBox.tsx
│   └── EditorLinkBox.tsx
├── actions/
│   ├── field-actions.ts
│   ├── function-actions.ts
│   ├── invocation-actions.ts
│   ├── list-actions.ts
│   └── relation-actions.ts
├── forms/
├── boxed-model.ts
├── boxed-embed.ts
└── boxed-editor-types.ts
```

Files SHOULD be grouped by responsibility rather than forced to match this tree exactly.

## 10. Migration plan

### Phase 1 — Establish typed entity dispatch

- [ ] Add an exhaustive `BoxedNode` dispatcher.
- [ ] Add characterization tests covering every `BoxedRenderNode.kind`.
- [ ] Route existing rendering through the dispatcher without changing behavior.
- [ ] Ensure an unknown or newly added kind produces a compile-time exhaustiveness failure.

### Phase 2 — Extract scalar and specialized boxes

- [ ] Implement `ExpressionBox` and preserve one-active-editor behavior.
- [ ] Implement `InputBox`.
- [ ] Implement `InvocationBox` and `InvocationArgumentBox`.
- [ ] Implement `ExternalFunctionBox`.
- [ ] Implement `EditorLinkBox`.
- [ ] Give each component focused props or focused hooks only.

### Phase 3 — Extract recursive structural boxes

- [ ] Implement `ContextBox` with recursive `BoxedNode` children.
- [ ] Implement `FunctionBox` with its signature and body children.
- [ ] Implement `ListBox` and `ListItemBox` with paging and virtualization.
- [ ] Implement `RelationBox` and `RelationRowBox` with column operations.
- [ ] Preserve expansion state and accessible tree/grid semantics.

### Phase 4 — Replace broad callback plumbing

- [ ] Move engine mutations behind focused semantic action hooks/controllers.
- [ ] Centralize refresh, error mapping, rollback, and `onChange` behavior.
- [ ] Remove `BoxedNodeRowProps`.
- [ ] Remove the universal `BoxedNodeRow`, `BoxedValueCell`, and `BoxedActionsCell` condition chains.
- [ ] Verify that no replacement “god context” exposes all operations to every entity.

### Phase 5 — Consolidate forms and finish cleanup

- [ ] Assign each edit form to its owning entity or focused form module.
- [ ] Retain shared dialog primitives only where they reduce real duplication.
- [ ] Remove obsolete compatibility code and unused internal types.
- [ ] Document the final internal architecture.
- [ ] Confirm the npm public API and emitted declarations are unchanged.

## 11. Testing strategy

### 11.1 Component tests

Each dedicated box MUST have focused React Testing Library coverage for:

- its primary read-only rendering;
- only the actions valid for that entity;
- error display relevant to the entity; and
- interaction with its focused command contract.

Tests SHOULD use the real engine for DSL/Portable behavior and MAY use narrow command spies when testing presentation
components in isolation.

### 11.2 Integration tests

`BoxedEditor` integration coverage MUST continue to verify:

- root and focused-path rendering;
- exactly one active `CodeEditorCell`;
- one `onChange` call per committed mutation;
- expression completions through the Portable embed context;
- context add, rename, duplicate, and guarded remove;
- function and external-function editing;
- invocation editing;
- literal-list paging, item mutations, and reorder;
- relation row and column mutations;
- type/ruleset/loop routing;
- read-only behavior; and
- fatal and path-scoped error states.

### 11.3 Storybook and browser tests

- Every existing Boxed Editor story MUST continue to open without the Storybook render error boundary.
- The reported manager route for `read-only-visual` MUST remain covered.
- Domain-component extraction MUST NOT remove the loan, large-model, nested-function, error, or integration stories.

## 12. Acceptance criteria

The refactoring is complete when:

- [ ] Every supported boxed entity has a dedicated component with an obvious domain name.
- [ ] `BoxedNode` contains only exhaustive dispatch logic.
- [ ] No component has a props contract comparable in scope to `BoxedNodeRowProps`.
- [ ] Entity components depend only on relevant state and actions.
- [ ] There is no universal value/action component branching over all node kinds.
- [ ] Engine mutation, validation, rollback, refresh, and notification behavior remains centralized.
- [ ] `BoxedEditorProps` and package exports remain backward compatible.
- [ ] Existing RTL, build, Storybook, and Playwright suites pass.
- [ ] New focused tests exist for every dedicated box.
- [ ] The component tree itself communicates the Boxed Editor mental model without reading a large conditional renderer.

## 13. Architectural review checklist

Before accepting each phase, reviewers should be able to answer “yes” to the following:

- Can the responsibility of each new component be described using one EdgeRules entity?
- Can its dependencies be understood without inspecting the complete editor?
- Would adding a different entity leave this component unchanged?
- Is engine-specific mutation behavior outside the presentation component?
- Does read-only rendering avoid unnecessary edit dependencies?
- Has abstraction reduced semantic coupling rather than only moving lines between files?
