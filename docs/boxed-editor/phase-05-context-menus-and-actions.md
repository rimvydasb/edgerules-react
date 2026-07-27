# Boxed Editor — Phase 5: Context menus and actions

> Self-contained plan for **Phase 5 of 8** of the `BoxedEditor` React UI implementation.
> Everything needed to implement this phase is in this file. Sibling phases live in `docs/boxed-editor/`.

## 1. Shared context

`BoxedEditor` (`src/components/boxed-editor/`, published as `edgerules-react/boxed-editor`) renders EdgeRules models
as **a single flat treegrid of rows** (Camunda / Trisotech / DMN-influenced, but more compact). The repo has **no
rule-evaluation logic** — execution is delegated to the WASM engine from the sibling `edgerules-v2` repo via
`@edgerules/web` (browser) / `@edgerules/node` (tests); shared types come from `@edgerules/portable`
(`PortableNode`, `PortableError`, `PortableRootContext`).

**Already implemented — do not re-implement:** `BoxedEditorService` + `normalize`/`denormalize`/`rowCache`,
`BoxedRowData` / `BoxedTableRowData` / `SignatureParameter`, `TestCasesService`, `TestRunner`,
`DocumentationService`.

**Wireframe (authoritative):** `/Users/rimvydasbingelis/Projects/EdgeRules/edgerules-react-frames/src` —
**`boxed/actions.ts` owns the action ids and icons**, `App.tsx` the composition, `boxed/*.tsx` the per-construct
rendering. Screenshot: `docs/screenshots/reference.png`.

**Coding standards (`CLAUDE.md`):** TypeScript + React function components; RTL tests in a component-local
`__tests__/` + a Storybook story; tests use the **real** engine (`@edgerules/node`) — never a mock, only
`fake-indexeddb` and a `registerSolver` stub are substituted; minimal public exports; engine/DSL bugs go to
`docs/BUG_REPORTS.md` instead of React workarounds.

**Prerequisites:** Phases 1–4 — all 21 row kinds render, `ExpressionCell` edits, `useRowCommands` +
`rowFactories` dispatch mutations, `NewRow` appends.

## 2. Goal of this phase

Give every row its three-dot menu: the per-kind action list, the icons, and a working implementation of every action
— including `Duplicate` auto-rename, `Convert to …`, and the `readOnly` enablement rules.

## 3. Per-kind action lists

Each row's `ActionsColumn` holds a vertical three-dot button opening `RowActionsMenu`. A "per instance" action
(e.g. one Delete-column entry per column) appears once in the table below and once **per instance** in the menu.

| Row Type                      | Key                             | Actions                                                                                                                                   |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Model Header                  | `model`                         | Add Field, Add Function, Add Optimisation, Add Decision Table, Add Relation, Add List, Model Settings, View as code                        |
| Type Field                    | `field`                         | Convert to Context, Convert to Relation, Convert to List, Duplicate, Delete                                                                |
| Context                       | `context`                       | Add Field, Add Function, Add Decision Table, Add Relation, Add List, Duplicate, Delete, Expand/Collapse                                    |
| Complex Type                  | `complexType`                   | Add Field, Duplicate, Delete, Expand/Collapse                                                                                             |
| List                          | `list`                          | Duplicate, Delete                                                                                                                         |
| List Item                     | `list-item`                     | Duplicate, Delete                                                                                                                         |
| Relation                      | `relation`                      | Add Column, Delete "‹column›" Column (per column), Delete                                                                                 |
| Relation Item                 | `relation-item`                 | Duplicate, Delete                                                                                                                         |
| Function                      | `function`                      | Add Argument, Duplicate, Delete "‹arg›" Argument (per arg), Delete, Expand/Collapse, View as code                                          |
| Function Result               | `function-result`               | Duplicate, Delete                                                                                                                         |
| Decision Table                | `ruleset`                       | Add Rule, Add Condition Column, Add Action Column, Delete "‹column›" Column (per column), Duplicate, Delete, Expand/Collapse, View as code |
| Rule                          | `rule`                          | Duplicate, Delete                                                                                                                         |
| Ruleset Default               | `ruleset-default`               | Delete                                                                                                                                    |
| Ruleset Hit Policy            | `ruleset-hit-policy`            | *(none — edited via its own picker chip)*                                                                                                 |
| Optimisation                  | `optimisation`                  | Add Argument, Delete "‹arg›" Argument (per arg), Duplicate, Delete, Expand/Collapse, View as code                                          |
| Optimisation Variable Group   | `optimisation-variable-group`   | Add Variable                                                                                                                              |
| Optimisation Variable         | `optimisation-variable`         | Duplicate, Delete                                                                                                                         |
| Optimisation Objective        | `optimisation-objective`        | Switch to Minimise/Maximise                                                                                                               |
| Optimisation Constraint Group | `optimisation-constraint-group` | Add Constraint                                                                                                                            |
| Optimisation Constraint       | `optimisation-constraint`       | Duplicate, Delete                                                                                                                         |
| Optimisation Setting          | `optimisation-setting`          | *(none — edited via its own control)*                                                                                                     |

Icons come from the wireframe's `boxed/actions.ts` — port the ids and icons 1:1.

## 4. What each action does

| Action                                     | Description                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete                                     | Deletes the row. Hidden/disabled when `BoxedRowData.deletable` is `false`.                                                                                                                                                                                                                                                |
| Duplicate                                  | Copies the row — and, for a container, **all its children** — and inserts the copy directly below. **Auto-renames** on a **named** kind (`field`, `context`, `complexType`, `function`, `ruleset`, `optimisation`, `optimisation-variable`, `optimisation-constraint`) to avoid colliding with the source; a **positional** kind (`list-item`, `relation-item`, `rule`) needs no rename, so Duplicate doubles as "insert a new one right after this one". |
| Model Settings                             | Form for model-level metadata (name, version, description).                                                                                                                                                                                                                                                              |
| View as code                               | Emits `onOpenNode({path, kind: 'code-editor'})` for that knowledge element (`model`, `function`, `ruleset`, `optimisation`). Where the code text comes from is the **host's** concern (Resolved Decision #15).                                                                                                            |
| Add Field                                  | Appends a `field` row to `model` / `context` / `complexType`.                                                                                                                                                                                                                                                             |
| Add Function                               | Appends a `function` row to `model` / `context`.                                                                                                                                                                                                                                                                         |
| Add Decision Table                         | Appends a `ruleset` row to `model` / `context`.                                                                                                                                                                                                                                                                          |
| Add Optimisation                           | Appends an `optimisation` row. **`model` only** — `optimise` may only be declared at the model root; nested is a link-time error (`OPTIMISATION_METAPHOR_SPEC.md` §3).                                                                                                                                                    |
| Add Relation / Add List                    | Appends a `relation` / `list` row to `model` / `context`.                                                                                                                                                                                                                                                                 |
| Add Item / Add Row                         | Appends a `list-item` to a `list` / a `relation-item` to a `relation`.                                                                                                                                                                                                                                                    |
| Add Argument                               | Appends an argument to a `function`'s or `optimisation`'s signature.                                                                                                                                                                                                                                                      |
| Delete "‹argument›" Argument (per argument) | Removes that argument from a `function`'s or `optimisation`'s signature.                                                                                                                                                                                                                                                  |
| Add Rule                                   | Appends a `rule` row to a `ruleset`'s matrix.                                                                                                                                                                                                                                                                             |
| Add Condition / Action Column              | Appends a condition / action column to a `ruleset`, extending **every** `rule` and `ruleset-default`.                                                                                                                                                                                                                     |
| Add Column                                 | Appends a field/column to **every record** of a `relation`.                                                                                                                                                                                                                                                              |
| Delete "‹column›" Column (per column)      | Removes that column from every row (a `relation`'s records, or a `ruleset`'s `rule`/`ruleset-default` rows).                                                                                                                                                                                                              |
| Add Variable / Add Constraint              | Appends an `optimisation-variable` / `optimisation-constraint` to its group.                                                                                                                                                                                                                                              |
| Convert to Context / Relation / List       | Converts a `field` into an **empty** `context` / `relation` / `list`.                                                                                                                                                                                                                                                     |
| Switch to Minimise / Maximise              | Flips an `optimisation-objective`'s keyword, keeping the expression unchanged.                                                                                                                                                                                                                                            |
| Expand / Collapse                          | Toggles children on `function`, `context`, `complexType`, `ruleset`, `optimisation` (a MUI expand/collapse icon marks state) — Resolved Decision #14.                                                                                                                                                                     |

**Enablement rules:**

- Add-actions insert at the position implied by their name (a child at the end of the container, or a sibling
  directly below the selected row); the facade's sort order then applies on read-back.
- In `readOnly` **every mutating action is hidden**; only `Duplicate` and the view toggles remain — `Duplicate` is a
  copy, so it does not mutate the source.
- There is **no copy/paste pair** — one-click `Duplicate` only (Resolved Decision #8; the wireframe's
  `rowActionRegistry` has no copy/paste ids).

## 5. Special actions

- Clearing an **argument's name** removes that argument from the `function`/`ruleset`/`optimisation` signature.
- Clearing an **expression's name while its value is also empty** removes the `field` from its context.

Both are implemented as `remove(path)` through the command layer.

## 6. Expand / collapse state

`expanded` (prop) sets the **initial global** expand state only. After first render each collapsible row keeps its
own state in `BoxedEditorUiContext`, toggled by its own Expand/Collapse action. Changing `revision` does **not**
reset per-row expand state.

## 7. How actions execute

Everything routes through `commands/useRowCommands.ts` (Phase 2):

- `setBoxedRowData(path, row)` — every `Add…` / `Convert to…` / column / argument / setting edit.
  **Writes are whole-node**: the row is denormalized **including its `children`**, and container edits rewrite the
  **whole parent** (engine arrays are append-only and reject gaps).
  **Optimisation is whole-definition**: child paths like `factoryProduction.variables.chairs` are row identities, not
  CRUD locations — the facade merges the child edit into the owning declaration and writes it once.
- `remove(path)` — `Delete`, cleared-name special actions, `Delete "‹column›" Column`.
- `rename(path, newName)` — name-cell commit on a named kind, and the auto-rename half of `Duplicate`.
- A returned `PortableError` is a **path-scoped** error: the edit is rejected, the cell keeps focus and shows the
  message inline, and the rest of the tree stays interactive. The facade cache is untouched for that path, so the
  **last-good row stays visible**. No rollback for a structurally-valid write that breaks a reference elsewhere
  (Resolved Decision #12) — it surfaces later wherever that path is next read.
- `onChange(service.toPortable())` fires **once per successful commit**.
- After a successful `rename`/`move` the command layer also calls `renamePath(from, to)` on both overlay services
  (Phase 6/7 wire the overlays; keep the call site here).

**Render rows in the order the service returns** — sorting happens in `normalize.ts`; never re-sort in React.

## 8. Files touched

```
src/components/boxed-editor/
├─ menu/actions.ts             — NEW: per-kind action lists + ids + icons (ported from the wireframe)
├─ menu/RowActionsMenu.tsx     — NEW: the three-dot menu component
├─ menu/useRowMenu.ts          — NEW: open/close + anchor handling
├─ hooks/useRowActions.ts      — NEW: BoxedRowKind ➜ menu items ➜ dispatchable commands
├─ commands/useRowCommands.ts  — extend with every remaining action
├─ commands/rowFactories.ts    — defaults for each Add… / Convert to…
└─ __tests__/duplicate-rename.test.tsx — NEW; __tests__/commands.test.tsx — extend
```

## 9. Tasks

- [x] Ensure project compiles and existing tests are passing
- [x] Add `menu/actions.ts`, `menu/RowActionsMenu.tsx`, `menu/useRowMenu.ts`, `hooks/useRowActions.ts` — the per-kind
      action lists from [§3](#3-per-kind-action-lists), with icons from the wireframe's `actions.ts`
- [x] Implement every [action](#4-what-each-action-does), including `Duplicate` auto-rename for named kinds,
      `Convert to …`, `Switch to Minimise/Maximise`, Expand/Collapse, `Model Settings`, and `View as code`
- [x] Implement the `readOnly` enablement rules (only `Duplicate` and Expand/Collapse survive)
- [ ] ~~Implement the [Special Actions](#5-special-actions)~~ — **partially done**: the command-layer half
      (`remove(path)` / `removeArgument`) is in place and is exactly what the menu's own `Delete` /
      `Delete "‹argument›" Argument` actions already dispatch, but there is still no editable **name** cell
      anywhere in this codebase (arguments render as static text in `ArgumentHeaders`; a `field`'s name has no
      cell at all) to *trigger* either special case by clearing a name — that UI doesn't exist yet in any prior
      phase, so wiring it here was out of scope for "context menus and actions" (and risked duplicate-text
      regressions in existing `getByText(name)` assertions). Revisit once a name-editing cell lands.
- [x] Add `__tests__/duplicate-rename.test.tsx`; extend `commands.test.tsx` to every action
- [x] Mark all checkboxes as done in this document once verified

## 10. Verification

| Test file                    | Covers                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `commands.test.tsx`          | **every** menu action, placeholders, special actions, auto-rename on Duplicate, one `onChange` per commit |
| `duplicate-rename.test.tsx`  | Duplicate of each named kind auto-renames without colliding; positional kinds duplicate without renaming; container Duplicate copies all children |

Both run against a real `MutableDecisionService` from `@edgerules/node` (with a `registerSolver` stub for
optimisation cases) — never a mock. Also assert that under `readOnly` every mutating item is absent from the menu
while `Duplicate` and the view toggles remain.
