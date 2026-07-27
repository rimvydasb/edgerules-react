# React Component Architecture

## Scope

`edgerules-react` is a component library, not a complete application. The current checkout contains reusable editing and
navigation surfaces under `src/components/*`; it does not contain the application Shell that arranges those surfaces
into a workspace.

## Component diagram

```mermaid
flowchart TB
  subgraph host["Host application"]
    Shell["Shell<br/>&lt;&lt;planned host component&gt;&gt;<br/>workspace layout, routing, shared services"]
  end

  subgraph components["Public React components"]
    Explorer["ProjectExplorer<br/>&lt;&lt;implemented&gt;&gt;"]
    Code["CodeEditor<br/>&lt;&lt;implemented&gt;&gt;"]
    Cell["CodeEditorCell<br/>&lt;&lt;implemented&gt;&gt;"]
    Boxed["BoxedEditor<br/>&lt;&lt;implemented&gt;&gt;"]
    Decision["DecisionTableEditor<br/>&lt;&lt;implemented&gt;&gt;"]
    Tests["TestsManager<br/>&lt;&lt;implemented&gt;&gt;"]
    Flow["FlowEditor<br/>&lt;&lt;planned&gt;&gt;<br/>React Flow based"]
    Types["TypesEditor<br/>&lt;&lt;planned&gt;&gt;"]
  end

  subgraph support["Shared non-visual modules"]
    Language["Code Editor language tooling<br/>diagnostics, completion, navigation,<br/>formatting and highlighting"]
    BoxedService["BoxedEditorService<br/>Portable model to row facade"]
    TestCases["TestCasesService<br/>test data and result persistence"]
    TestRunner["TestRunner<br/>test execution orchestration"]
    Documentation["DocumentationService<br/>path-keyed descriptions"]
  end

  subgraph engine["EdgeRules engine boundary"]
    Mutable["MutableDecisionService<br/>supplied by the host"]
    Portable["@edgerules/portable<br/>shared Portable types"]
  end

  Shell -->|"renders / selects"| Explorer
  Shell -->|"renders / selects"| Code
  Shell -->|"renders / selects"| Boxed
  Shell -->|"renders / selects"| Decision
  Shell -->|"renders / selects"| Tests
  Shell -.->|"planned surface"| Flow
  Shell -.->|"planned surface"| Types
  Explorer -.->|"open callbacks"| Shell

  Boxed -->|"renders expression cells"| Cell
  Decision -->|"renders the active DSL cell"| Cell
  Tests -->|"renders editable path cells"| Cell

  Code -->|"uses"| Language
  Cell -->|"uses"| Language
  Decision -->|"uses static highlighting"| Language

  Boxed -->|"reads and mutates through"| BoxedService
  Boxed -.->|"optional descriptions"| Documentation
  Boxed -.->|"optional test data"| TestCases
  Boxed -.->|"optional automatic runs"| TestRunner
  Tests -->|"creates and owns"| TestCases
  Tests -->|"creates and uses"| TestRunner
  Tests -.->|"optional descriptions"| Documentation

  Explorer -->|"get"| Mutable
  Decision -->|"get / set"| Mutable
  Tests -->|"inspect model"| Mutable
  BoxedService -->|"facade over CRUD"| Mutable
  TestRunner -->|"execute"| Mutable
  Language -->|"diagnostics / completions"| Mutable
  Mutable -->|"returns"| Portable

  classDef implemented fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20;
  classDef planned fill:#fff8e1,stroke:#f9a825,color:#6d4c00,stroke-dasharray:6 4;
  classDef service fill:#e3f2fd,stroke:#1565c0,color:#0d47a1;
  classDef external fill:#f3e5f5,stroke:#7b1fa2,color:#4a148c;

  class Explorer,Code,Cell,Boxed,Decision,Tests implemented;
  class Shell,Flow,Types planned;
  class Language,BoxedService,TestCases,TestRunner,Documentation service;
  class Mutable,Portable external;
```

- Between implemented nodes, **solid arrows** represent runtime composition or calls. 
- The solid arrows leaving the planned Shell show its intended primary composition. 
- Dashed arrows represent optional collaboration, callback flow, or surfaces that are themselves still planned. 
In particular, `CodeEditorCell` reuses the language modules under `code-editor`; it does not render or wrap 
the `CodeEditor` React component.

## Main React components

| Component             | Source and package entry point                                                         | Responsibility                                                                                                                                           | Direct component dependency                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `CodeEditor`          | `src/components/code-editor`; package root and `edgerules-react/code-editor`           | Full-document EdgeRules DSL editing with CodeMirror and engine-backed language features.                                                                 | None. It uses the shared code-editor language modules.                                                      |
| `CodeEditorCell`      | `src/components/code-editor-cell`; package root and `edgerules-react/code-editor-cell` | Compact DSL editor with grid-friendly commit, cancel, blur and focus behavior.                                                                           | None. It uses the shared code-editor language modules rather than `CodeEditor`.                             |
| `BoxedEditor`         | `src/components/boxed-editor`; package root and `edgerules-react/boxed-editor`         | Structured treegrid editor over a `BoxedEditorService`.                                                                                                  | Renders `CodeEditorCell` for active expression cells.                                                       |
| `DecisionTableEditor` | `src/components/decision-table`; package root and `edgerules-react/decision-table`     | DMN-style ruleset table editor backed by `get`/`set` operations.                                                                                         | Renders one `CodeEditorCell` for the active DSL cell and uses shared static highlighting.                   |
| `TestsManager`        | `src/components/tests-manager`; `edgerules-react/tests-manager`                        | Test-case grid, subject selection, persistence and execution orchestration.                                                                              | Renders `CodeEditorCell` for editable path cells.                                                           |
| `ProjectExplorer`     | `src/components/project-explorer`; package root and `edgerules-react/project-explorer` | Lazily loaded tree navigation for contexts, variables, functions, decision tables and types.                                                             | None. It reports navigation intent through callbacks instead of importing editors.                          |
| `FlowEditor`          | Not present and not exported.                                                          | Planned React Flow-based visual editor for input, function, ruleset, terms, chart and output nodes.                                                      | No source dependency can be asserted until it is implemented.                                               |
| `TypesEditor`         | Not present and not exported.                                                          | Planned editor for EdgeRules type definitions.                                                                                                           | No source dependency can be asserted until it is implemented.                                               |
| `Shell`               | Not present and not exported.                                                          | Planned application integration layer that owns workspace layout, active-editor routing, shared engine/service instances and navigation callback wiring. | Composes the public components; it belongs to a host application unless later added as a library component. |

## Dependency rules

### Shell owns cross-editor navigation

Major editors remain independently renderable. `ProjectExplorer` exposes `onOpenVariables`, `onOpenFunction`,
`onOpenDecisionTable` and `onOpenTypes` callbacks. A Shell should translate those callbacks into active-editor state and
resolve the selected model path into the props or source text expected by the corresponding editor. This avoids direct
dependencies such as `ProjectExplorer` importing `DecisionTableEditor`.

### The engine remains the model authority

React components do not implement rule evaluation and should not keep a second persisted copy of the model. The host
supplies a service compatible with the required subset of `MutableDecisionService`:

- `ProjectExplorer` reads with `get`;
- `DecisionTableEditor` reads and commits with `get`/`set`;
- `BoxedEditor` works through `BoxedEditorService`, a facade over engine CRUD;
- `TestsManager` inspects the model and its `TestRunner` executes it; and
- code-editor language tooling asks the service for diagnostics and completions.

Portable model nodes and errors cross this boundary using `@edgerules/portable` types.
