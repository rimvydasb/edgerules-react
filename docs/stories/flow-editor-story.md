# Flow Editor: FunctionNode

## Summary

`FunctionNode` is the first node of the EdgeRules Flow Editor. It renders one model field annotated `@FunctionNode`
whose value is a Portable `invocation` of a user-defined `func` or `ruleset`.

The node shows structure only: the callee, one input pin per argument, one output pin per result field. Wires show
where argument values come from.

Output nodes show result values. The node renders alone in Storybook inside a `@xyflow/react` canvas.

The visual design is the approved proposal: [FunctionNode Design Proposal](<stories/FunctionNode Design Proposal.html>).
Open it in a browser.

The proposal is the reference for layout, colors, pins, menus and states. This story is the reference for behavior and
tasks.

## Technical Breakdown

### Files

| File                                                          | Responsibility                                                              |
|---------------------------------------------------------------|-----------------------------------------------------------------------------|
| `src/lib/callables.ts`                                        | `listCallables()`: every user callable in the model, moved from tests-manager |
| `src/lib/linkCheck.ts`                                        | `setWithLinkCheck()`: write, link, revert on failure; moved from boxed-editor |
| `src/ui/RowActionsMenu.tsx`                                   | Shared Mantine menu, moved from `boxed-editor/menu/RowActionsMenu.tsx`      |
| `src/components/flow-editor/index.ts`                         | Public exports of the `edgerules-react/flow-editor` subpath                 |
| `src/components/flow-editor/FlowEditorProvider.tsx`           | React context for the service, documentation service and host callbacks    |
| `src/components/flow-editor/flow-editor-types.ts`             | Public and internal types (see Component API)                              |
| `src/components/flow-editor/service/createFlowEditorService.ts` | Engine-backed reads, writes, drafts and link checks for flow nodes        |
| `src/components/flow-editor/function-node/FunctionNode.tsx`   | The `@xyflow/react` custom node component                                  |
| `src/components/flow-editor/function-node/layout.ts`          | Pure track-width computation in 40px steps                                 |
| `src/components/flow-editor/function-node/CalleePicker.tsx`   | Searchable callee list (Mantine `Combobox`)                                |
| `src/components/flow-editor/function-node/DescriptionRow.tsx` | Description display and inline edit                                        |
| `src/components/flow-editor/function-node/functionNode.module.css` | Node styles                                                           |
| `src/components/flow-editor/__tests__/`                       | Vitest + RTL tests against the real `@edgerules/node` engine               |
| `stories/components/flow-editor/FunctionNode.stories.tsx`     | Storybook stories against the real `@edgerules/web` engine                 |
| `e2e/flow-editor/function-node.spec.ts`                       | Playwright tests against the built Storybook                               |

### Structural Diagram

The `flow-editor` package and the existing code it depends on:

```mermaid
flowchart TB
  subgraph stories["Storybook"]
    Story["FunctionNode.stories.tsx"]
  end
  subgraph flow["flow-editor"]
    Provider["FlowEditorProvider"]
    Node["FunctionNode"]
    Picker["CalleePicker"]
    Desc["DescriptionRow"]
    Layout["layout.ts"]
    Service["FlowEditorService"]
  end
  subgraph shared["Shared and existing code"]
    Menu["RowActionsMenu"]
    Callables["listCallables"]
    Boxed["BoxedEditorService"]
    Docs["DocumentationService"]
  end
  Engine["MutableDecisionService"]

  Story -->|renders in ReactFlow canvas| Provider
  Provider -->|provides context to| Node
  Node -->|opens| Picker
  Node -->|renders| Desc
  Node -->|renders node and argument menus with| Menu
  Node -->|computes track widths with| Layout
  Node -->|sends commands to| Service
  Desc -->|reads and writes descriptions in| Docs
  Service -->|lists callees with| Callables
  Service -->|edits parameters and results with| Boxed
  Service -->|get, set, remove, link| Engine
  Boxed -->|get, set, rename, link| Engine
  Callables -->|get with ALL filter| Engine
```

### Component API

The public API is the `edgerules-react/flow-editor` subpath. Keep it to these exports.

```typescript
// FlowEditorProvider props
interface FlowEditorProviderProps {
    service: FlowEditorService; // engine-backed node service from createFlowEditorService()
    documentation?: DocumentationService; // stores node descriptions; omit to hide description UI
    readOnly?: boolean; // disables every mutation; menus show only non-mutating items
    onOpenNode?: (target: FlowEditorOpenTarget) => void; // routes "Open in…", "Open tests", "View as code" to the host
    children: ReactNode; // the ReactFlow canvas
}

// Host routing target; reuses the Boxed Editor kinds and adds 'tests'
interface FlowEditorOpenTarget {
    path: string; // callee path ('risk') or node field path ('decision')
    kind: BoxedEditorTargetKind | 'tests'; // 'ruleset', 'boxed-editor', 'code-editor' or 'tests'
}

// ReactFlow node data; the node id is the field path
interface FunctionNodeData {
    field: string; // model field path of the invocation, for example 'decision'
}

// Factory
declare function createFlowEditorService(mutable: MutableDecisionService): FlowEditorService;

interface FlowEditorService {
    listCallees(): CalleeRef[]; // user func and ruleset entries with only typed parameters
    getFunctionNode(field: string): FunctionNodeModel; // committed invocation plus any draft overlay
    createDraftNode(): string; // new field name from uniqueName('node', …); no callee, nothing written
    setCallee(field: string, method: string): PortableError | void; // keeps bindings with same name and type
    bindArgument(field: string, parameter: string, sourcePath: string): PortableError | void; // link-checked
    unbindArgument(field: string, parameter: string): void; // turns the node into a draft
    setNodeName(field: string, name: string): PortableError | void; // '@node-name' only
    renameField(field: string, newName: string): PortableError | void; // rewrites wires, moves description
    duplicate(field: string): string | PortableError; // returns the new field name
    removeFromFlow(field: string): PortableError | void; // remove(`${field}.@FunctionNode`)
    deleteField(field: string): PortableError | void; // remove(field), link-checked
    addArgument(field: string, after?: string): PortableError | void; // after = undefined appends
    moveArgument(field: string, parameter: string, direction: 'up' | 'down'): PortableError | void;
    removeArgument(field: string, parameter: string): PortableError | void; // refused when the body uses it
    renameResult(field: string, from: string, to: string): PortableError | void; // link-checked, reverted on failure
    subscribe(listener: () => void): Unsubscribe; // fires after every committed change
}

interface CalleeRef {
    path: string; // dotted callee path, for example 'risk' or 'group.nested'
    kind: 'function' | 'ruleset';
    parameters: SignatureParameter[]; // from get(path, 'FIELDS')
    returnLabel: string; // 'number' or '{ level, limit }'
}

interface FunctionNodeModel {
    field: string; // model field path
    label?: string; // '@node-name'
    callee?: CalleeRef; // undefined while no callee is picked
    arguments: NodeArgument[]; // one per callee parameter, in signature order
    results: NodeResult[]; // record fields, or one unnamed 'result'
    draft: boolean; // true while a required argument is unbound; the draft is not in the model
    callers: number; // invocations of the callee in the whole model
    error?: { parameter: string; message: string }; // last rejected bindArgument
}

interface NodeArgument {
    name: string;
    type: string; // 'number', 'string', 'Applicant', 'number[]'
    binding?: { kind: 'path' | 'value'; text: string }; // 'path' draws a wire; 'value' is a literal or expression
    used: boolean; // the callee body references it; Delete argument is disabled
}

interface NodeResult {
    name: string; // field name, or 'result' for an unnamed return
    type: string;
    renamable: boolean; // false for the unnamed return of a func
}
```

### Node anatomy

The proposal shows every part. The table maps each part to its data and behavior.

| Part              | Source                                    | Behavior                                                              |
|-------------------|-------------------------------------------|-----------------------------------------------------------------------|
| Kind tile         | `callee.kind`                             | Boxed Editor color and icon: `func` `#1976d2`, `ruleset` `#6a1b9a`    |
| Header line 1     | `label`, `field`, `draft`                 | Bold label, mono field name, "draft" badge, node menu ⋮               |
| Header line 2     | `callee.path`, `callee.returnLabel`       | Callee chip opens `CalleePicker`; whole-result pin `out:*` at the right edge |
| Description row   | `DocumentationService` at `field`         | Full width, yellow tint, two-line clamp, click to edit                |
| Argument band     | `arguments.length`                        | Reads ARGUMENT or ARGUMENTS; hidden with zero parameters              |
| Result band       | `results.length`                          | Reads RESULT or RESULTS                                               |
| Argument row      | `NodeArgument`                            | Name and required mark only; ⋮ on hover or focus; pin `in:<name>`     |
| Result row        | `NodeResult`                              | Right-aligned name; click to rename; pin `out:<name>`                 |

The node MUST NOT show argument bindings or result values. The pin tooltip shows the binding text.

### Pins

| Pin            | Condition                                         | Style                               |
|----------------|---------------------------------------------------|-------------------------------------|
| Filled circle  | Scalar, `binding.kind === 'path'`                 | Fill and ring in the type color     |
| Dotted ring    | `binding.kind === 'value'`                        | No wire                             |
| Square         | Record type, and the `out:*` pin                  | Radius 2px                          |
| Double ring    | List type (`number[]`)                            | Ring in the element type color      |
| Red ring       | No binding, or `error.parameter` matches          | `--mantine-color-error`             |

Type colors: number blue, string green, boolean orange, date and time teal, record grey. Define them as CSS custom
properties in `functionNode.module.css` with light and dark values from the Mantine palette.

- **Handle ids:** `in:<parameter>`, `out:<result>` and `out:*`.
- **Node id:** the field path.
- **Source path:** `<nodeId>.<result>`, or `<nodeId>` for `out:*`.

### Sizing

`layout.ts` exports a pure function. Text measurement is injected, so tests run without a canvas.

```typescript
interface FunctionNodeLayoutInput {
    titleWidth: number; // measured width of label plus field name plus badge
    calleeLineWidth: number; // measured width of the CALLS label, chip and return type
    argumentNameWidths: number[]; // measured widths of argument names
    resultNameWidths: number[]; // measured widths of result names
}

interface FunctionNodeLayout {
    argumentTrack: number; // px, 0 when there are no arguments
    resultTrack: number; // px
    width: number; // px, argumentTrack + resultTrack
}

declare function computeFunctionNodeLayout(input: FunctionNodeLayoutInput): FunctionNodeLayout;
```

- Each track is its widest name plus padding, rounded up to whole 40px steps, from 2 to 4 steps.
- The header width wins over the body. The extra steps go half to each track, the larger half to the result track.
- The description row never changes the width.
- Names longer than the track are cut with an ellipsis. The full name is in a tooltip.

### Menus

The node menu and the argument menu use `RowActionsMenu`. Disabled items show the reason in a tooltip.

| Menu     | Group          | Item                          | Service call                                        |
|----------|----------------|-------------------------------|-----------------------------------------------------|
| Node     | This node      | Rename node                   | `setNodeName`                                       |
| Node     | This node      | Rename field                  | `renameField`                                       |
| Node     | This node      | Change callee…                | opens `CalleePicker`, then `setCallee`              |
| Node     | This node      | Duplicate                     | `duplicate`                                         |
| Node     | This node      | Add description               | shows the description row in edit mode; no description exists |
| Node     | This node      | Remove description            | `documentation.setDescription(field, '')`; a description exists |
| Node     | Callee · N callers | Add argument              | `addArgument(field)`                                |
| Node     | Callee · N callers | Open in decision table editor | `onOpenNode({ path, kind: 'ruleset' })`; reads "Open in boxed editor" with `kind: 'boxed-editor'` for a `func` |
| Node     | Callee · N callers | Open tests                | `onOpenNode({ path, kind: 'tests' })`               |
| Node     | Callee · N callers | View as code              | `onOpenNode({ path: field, kind: 'code-editor' })`  |
| Node     | Remove         | Remove from flow              | `removeFromFlow`                                    |
| Node     | Remove         | Delete (red)                  | `deleteField`                                       |
| Argument | -              | Move up                       | `moveArgument(field, name, 'up')`; disabled on the first row |
| Argument | -              | Move down                     | `moveArgument(field, name, 'down')`; disabled on the last row |
| Argument | -              | Add argument below            | `addArgument(field, name)`                          |
| Argument | -              | Delete argument (red)         | `removeArgument`; disabled when `used`              |

The argument menu footer reads "Changes `<callee>` for N callers". Results have no menu.

### Inline edits

| Edit               | Trigger          | Commit                        | Cancel  | Rule                                                  |
|--------------------|------------------|-------------------------------|---------|-------------------------------------------------------|
| Rename result      | Click result name | Enter or click away          | Escape  | Identifier pattern, unique among results; not for an unnamed return |
| Edit description   | Click description | Enter or click away          | Escape  | Single-line input; an empty text deletes the description |
| New argument name  | Add argument     | Enter or click away           | Escape  | Same rules as the Boxed Editor argument header        |

### Behavioral Diagram

```mermaid
sequenceDiagram
  participant User
  participant Canvas as ReactFlow canvas
  participant Service as FlowEditorService
  participant Engine as MutableDecisionService

  User->>Canvas: drop wire on in:segment
  Canvas->>Service: bindArgument('decision', 'segment', 'applicant.income')
  alt node is a draft after the change
    Service->>Service: store invocation in the draft map
  else every required argument is bound
    Service->>Engine: set('decision', invocation)
    Service->>Engine: link()
    alt link fails
      Service->>Engine: set('decision', previous)
      Service-->>Canvas: PortableError, model.error = { parameter, message }
    else link succeeds
      Service-->>Canvas: notify subscribers
    end
  end
```

### Draft nodes

- A node with an unbound required argument is a draft. The service keeps its invocation in memory only.
- `getFunctionNode` returns the draft overlay over the committed field. A new node is a draft with no callee.
- The service writes the invocation when the last required argument is bound. `@node: 'FunctionNode'` is part of
  that write.

### Reuse

| Need                                       | Existing code                                                                 |
|--------------------------------------------|-------------------------------------------------------------------------------|
| List user callables                        | `listTestSubjects` walk in `tests-manager/model/subjects.ts`                  |
| Add, move, remove a parameter with call-site migration | `addArgument`, `moveArgument`, `removeArgument` in `boxed-editor/commands/rowFactories.ts` + `BoxedEditorService.setBoxedRowData` |
| Ruleset parameter (condition column)       | `addConditionColumn`, `moveConditionColumn`, `removeConditionColumn`          |
| Rename a ruleset result (action column)    | `renameActionColumn`                                                          |
| Rename a `func` result field               | `BoxedEditorService.rename(`${callee}.${from}`, to)`                          |
| Write with link check and revert           | `setWithLinkCheck` in `boxed-editor/service/createBoxedEditorService.ts`      |
| Menu                                       | `RowActionsMenu` in `boxed-editor/menu/RowActionsMenu.tsx`                    |
| Unique names                               | `uniqueName` in `boxed-editor/commands/rowFactories.ts`                       |
| Descriptions                               | `DocumentationService`, `useDescription`                                      |

## Architecture Changes

- `FlowEditor` changes from "Not present" to a package with `FunctionNode` in `docs/ARCHITECTURE.md`.
- New ADR in `docs/architecture-adr.md`: a `FunctionNode` with an unbound required argument stays an editor draft.
  Context: the engine rejects the whole model with `E113` for one missing argument.

## Clarifications

- Engine facts verified on `@edgerules/node` `0.0.6-alpha.202607291629`:
    - `get(path)` on a mutable service returns the full definition. Pass `'FIELDS'` to get a `function-schema` or
      `ruleset-schema`.
    - `get(field, 'FIELDS')` on a record-returning invocation returns `"@type": "object"`. Result fields come from the
      callee schema `@return`.
    - `set` accepts a mistyped or incomplete invocation without an error. Only linking detects it.
    - One unbound required argument raises `E113` at link time, and no field of the model evaluates.
    - A mistyped argument raises `type mismatch in node NodeId(n): expected string, found number`. The message has no
      argument name, so the service assigns it to the parameter of the current `bindArgument` call.
    - `rename()` on a plain field does not migrate references. Dangling references raise `E103` at link time.
    - `remove('decision.@FunctionNode')` removes the annotation and keeps the field.
    - `DocumentationService.setDescription(path, '')` deletes the entry.
- Built-in functions are not callees. The callee list has user `func` and `ruleset` entries only.
- The unnamed return of a `func` (`func monthly(amount: number): amount / 12`) shows one result named `result`. It is
  not renamable, because naming it changes the return type for every caller.
- A new parameter is `number` for a `func` and `string` for a `ruleset`. `listCallables` drops callables with untyped
  parameters, so a new parameter always has a type.
- The Delete key on a selected node calls `removeFromFlow`, not `deleteField`.
- `callers` counts every `invocation` with the same `@method` in `toPortable()`.
- Tests use `@edgerules/node`. Stories use `@edgerules/web` with `await init()` in `loaders`. Neither mocks the engine.

## Out of Scope

- The Flow Editor canvas component, node positions and their persistence (`FlowMetadataStore`).
- InputNode, OutputNode and the other node kinds. Stories use story-local stub nodes for wire sources and output values.
- `optimise` and `loop` callees.
- Editing argument values without a wire. View as code covers it.

## Open Questions

1. Which version of `@xyflow/react` to pin? The latest 12.x is the default unless the architect states otherwise.

## Verification

| Check      | Command                    |
|------------|----------------------------|
| Build      | `npm run build`            |
| Typecheck  | `npm run typecheck`        |
| Format     | `npm run format:check`     |
| Test       | `npm test`                 |
| E2E        | `npm run e2e`              |
| Start      | `npm run storybook`        |

## Tasks

**Phase 1: Package setup and shared code**

- [x] Ensure the project compiles and existing tests pass
- [x] Add `@xyflow/react` as an optional peer dependency and a dev dependency
- [x] Add the `flow-editor` subpath to `package.json` `exports` and to the `tsdown.config.ts` `entry`
- [x] Move `RowActionsMenu` to `src/ui/RowActionsMenu.tsx`; update Boxed Editor imports
- [x] Move the callable walk to `src/lib/callables.ts` as `listCallables()`; `listTestSubjects` calls it
- [x] Move `setWithLinkCheck` to `src/lib/linkCheck.ts`; Boxed Editor imports it
- [x] Add tests for the code of this phase

Acceptance criteria:

- [x] `npm test` passes, including `callables.test.ts` and the existing tests-manager and boxed-editor suites
- [x] `npm run build` emits `dist/components/flow-editor/index.js`

**Phase 2: Service and layout**

- [ ] Write `flow-editor-types.ts` with the Component API types
- [ ] Write `createFlowEditorService`: `listCallees`, `getFunctionNode`, `createDraftNode`, `setCallee`, `bindArgument`,
  `unbindArgument`, draft map, `subscribe`
- [ ] Write `computeFunctionNodeLayout` in `layout.ts`
- [ ] Add tests for the code of this phase, against `MutableDecisionService.fromCode` from `@edgerules/node/mutable`,
  with the sample model from the proposal

Acceptance criteria:

- [ ] `createFlowEditorService.test.ts` passes with these cases:
    - [ ] The service does not write a draft.
    - [ ] The last required binding writes the invocation with `@node`.
    - [ ] A mistyped binding is reverted and sets `error.parameter`.
    - [ ] `setCallee` keeps bindings with the same name and type.
- [ ] `layout.test.ts` passes: step rounding, 2 to 4 step limits, header-wins distribution, no argument track for zero
  parameters

**Phase 3: FunctionNode rendering**

- [ ] Write `FlowEditorProvider` and `FunctionNode` with header, bands, rows, pins and handles from the proposal
- [ ] Write `functionNode.module.css` with Mantine variables, type color tokens, light and dark values
- [ ] Write `CalleePicker` with search and Functions / Rulesets groups
- [ ] Add the Storybook stories:
    - [ ] Default (`risk`), Unnamed return (`monthly`), Record argument (`applicantDecision`)
    - [ ] Draft, No callee
    - [ ] Wired: story-local stub source and output nodes. The output value comes from `execute`.
- [ ] Add tests for the code of this phase (RTL inside `ReactFlowProvider`)

Acceptance criteria:

- [ ] `FunctionNode.test.tsx` passes with these cases:
    - [ ] Band labels are singular or plural.
    - [ ] No binding text and no value text renders.
    - [ ] The draft badge shows for an unbound argument.
    - [ ] The picker lists only user callables.
- [ ] Manual: `npm run storybook`, each FunctionNode story matches the proposal in light and dark themes

**Phase 4: Menus and inline edits**

- [ ] Write the node menu and the argument menu from the Menus table
- [ ] Write `addArgument`, `moveArgument`, `removeArgument`, `renameResult`, `setNodeName`, `renameField`,
  `duplicate`, `removeFromFlow`, `deleteField` in the service, with the Reuse table helpers
- [ ] Write inline result rename and `DescriptionRow` with Add description and Remove description
- [ ] Add stories with `play` functions: Node menu, Argument menu, Rename result, Edit description
- [ ] Add tests for the code of this phase

Acceptance criteria:

- [ ] `FunctionNodeMenus.test.tsx` passes with these cases:
    - [ ] Delete argument is disabled for a used parameter.
    - [ ] Move up is disabled on the first row.
    - [ ] Add argument below inserts after the row.
    - [ ] The unnamed `result` has no rename input.
- [ ] `createFlowEditorService.test.ts` passes with these cases:
    - [ ] `renameResult` rewrites the wires of every caller.
    - [ ] `renameResult` reverts on a failed link.
    - [ ] `removeFromFlow` keeps the field.
    - [ ] Parameter edits migrate every call site.
- [ ] `DescriptionRow.test.tsx` passes: an empty commit deletes the description; Escape restores the old text

**Phase E2E**

- [ ] Add E2E tests for the user flows of this story in `e2e/flow-editor/function-node.spec.ts`

Acceptance criteria:

- [ ] `npm run e2e` passes, including pick a callee, wire an argument, rename a result, add and remove a description

**Phase X**

- [ ] Update `docs/ARCHITECTURE.md` and `docs/architecture-adr.md` with `## Architecture Changes`
- [ ] Update `README.md`: check the FunctionNode box and link this story
- [ ] Review the implementation against this story, the proposal and the project conventions

Acceptance criteria:

- [ ] Every command in `## Verification` passes
- [ ] Storybook starts with `npm run storybook` and shows the FunctionNode stories
