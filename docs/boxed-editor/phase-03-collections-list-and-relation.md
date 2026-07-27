# Boxed Editor — Phase 3: Collections — `list` and `relation`

> Self-contained plan for **Phase 3 of 8** of the `BoxedEditor` React UI implementation.
> Everything needed to implement this phase is in this file. Sibling phases live in `docs/boxed-editor/`.

## 1. Shared context

`BoxedEditor` (`src/components/boxed-editor/`, published as `edgerules-react/boxed-editor`) renders EdgeRules models
as **a single flat treegrid of rows** (Camunda / Trisotech / DMN-influenced, but more compact). The repo has **no
rule-evaluation logic** — execution is delegated to the WASM engine from the sibling `edgerules-v2` repo via
`@edgerules/web` (browser) / `@edgerules/node` (tests); shared types come from `@edgerules/portable`
(`PortableNode`, `PortableError`, `PortableRootContext`).

**Already implemented — do not re-implement:** `BoxedEditorService` + `normalize`/`denormalize`/`rowCache`
(`boxed-editor/service/`), `BoxedRowData` / `BoxedTableRowData` (`boxed-editor/boxed-editor-types.ts`),
`TestCasesService`, `TestRunner`, `DocumentationService`.

**Wireframe (authoritative GUI reference):**
`/Users/rimvydasbingelis/Projects/EdgeRules/edgerules-react-frames/src` — `App.tsx` (composition/occupancy),
`boxed/actions.ts` (row kinds + menus), `boxed/*.tsx` (per-construct rendering). Screenshot:
`docs/screenshots/reference.png`.

**Coding standards (`CLAUDE.md`):** TypeScript + React function components; RTL tests in a component-local
`__tests__/` + a Storybook story; tests use the **real** engine (`@edgerules/node`) — never a mock, only
`fake-indexeddb` and a `registerSolver` stub are substituted; minimal public exports; engine/DSL bugs go to
`docs/BUG_REPORTS.md` instead of React workarounds.

**Prerequisites:** Phase 1 (primitives, contexts, `useBoxedRows`, `RowSwitch`) and Phase 2 (`ExpressionCell`,
`useRowCommands`, `rowFactories`).

### GUI language recap

- The smallest `cell` is **40×40 px**; rows grow vertically only in 40 px steps; cells grow horizontally only in
  40 px steps; all text vertically centred, all cells aligned — no pixel offsets.
- Columns: `NameColumn` (depth via skipped leading cells), `ValueColumn`, `DescriptionColumn`, `TestResultsColumn`,
  `ActionsColumn` (three-dot menu, one cell).
- Type disclosure: every type is a tooltip on its owning name/header cell — for a `relation` that means the **column
  headers**. Hovering opens one; **holding Alt** opens every tooltip in the tree at once (`showType` gates it).
- `list` / `list-item` / `relation` / `relation-item` are all **single-height (40 px)** rows; only `function`,
  `ruleset`, `optimisation`, `model` are tall (80 px).

## 2. Goal of this phase

Render and edit the two collection families in place — scalar `list`s and complex-object `relation`s — plus the
trailing append placeholder used by every appendable container.

## 3. Relation vs. list classification (done by the service — contract, not work)

| Dimension           | List                             | Relation                                                                                                     |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Item shape          | scalar                           | complex object (context)                                                                                     |
| Header row kind     | `list`                           | `relation`                                                                                                   |
| Item row kind       | `list-item`                      | `relation-item`                                                                                              |
| Header's `columns`  | n/a                              | ordered union of every field seen across all records, **first-authored-appearance order**; metadata keys are never columns |
| Item's cell mapping | one `value` per item             | one `cells[i]` per column, aligned to the header's `columns`                                                  |
| Heterogeneous items | n/a — one scalar type throughout | a record missing a field renders an **empty cell**, never a nested field row                                  |

A computed, non-CRUD-addressable array (e.g. `for … return …`) is **neither**: it renders as a single `field` row
showing its result summary. Loops have no `BoxedRowKind` — loop text is opaque expression content.

### Cell value mapping

| Portable node | `kind`                       | Cell text                                  |
| ------------- | ---------------------------- | -------------------------------------------- |
| list item     | `list-item` (`value`)        | the item's DSL literal (`'Underwriting'`)  |
| relation cell | `relation-item` (in `cells`) | the field's DSL literal, per column         |

A `relation-item` cell whose value is **itself a complex object** is a **drill-down**: it renders nested rows, not
JSON text.

Cell text stays **opaque** — DSL text in, DSL text out, verbatim; the view never parses DSL.

## 4. Row kinds implemented here

| Row Type      | Key             | Menu actions (wired in Phase 5)                                  | Short description                                                                    |
| ------------- | --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| List          | `list`          | Duplicate, Delete                                                | Header of a homogeneous scalar list; items appended via the trailing placeholder row |
| List Item     | `list-item`     | Duplicate, Delete                                                | One scalar list element; Duplicate inserts a copy directly below it                  |
| Relation      | `relation`      | Add Column, Delete "‹column›" Column (per column), Delete        | Header of a homogeneous complex-object collection                                    |
| Relation Item | `relation-item` | Duplicate, Delete                                                | One record of a relation, one cell per column                                        |

`RelationRow` owns its **column-header sub-grid** (one header cell per entry in `columns`, each carrying its type
tooltip). `RelationItemRow` renders one cell per column, aligned to the header, with an empty cell where the record
has no such field.

`list` and `relation` are ordinary sortable rows; their drag handle drags the header **and all its items** (drag
behaviour itself is Phase 6).

## 5. Append placeholders

Every appendable container renders a **trailing placeholder row**; interacting with it appends without opening the
menu. Implement `rows/NewRow.tsx` generically and wire the whole table (rows for kinds from later phases simply start
working when those kinds land):

| Container Kind                               | Placeholder Row Kind      | Label              |
| -------------------------------------------- | ------------------------- | ------------------ |
| `model` (root), `context`, `function` (body) | `field`                   | "(new item)"       |
| `complexType`                                | `field`                   | "(new field)"      |
| `list`                                       | `list-item`               | "(new item)"       |
| `relation`                                   | `relation-item`           | "(new row)"        |
| `ruleset`                                    | `rule`                    | "(new rule)"       |
| `optimisation-variable-group`                | `optimisation-variable`   | "(new variable)"   |
| `optimisation-constraint-group`              | `optimisation-constraint` | "(new constraint)" |

Placeholders are hidden under `readOnly`.

## 6. Mutations: whole-parent rewrites

**Writes are whole-node.** `setBoxedRowData` denormalizes the row **including its `children`** into one
`PortableNode`. Container edits — add/remove/reorder a `list` item, a `relation` record, or a relation **column** —
rewrite the **whole parent**, because engine arrays are append-only and reject gaps.

Concretely:

- **Add Item / Add Row** — append a `list-item` / `relation-item` to the parent's `children`, then
  `setBoxedRowData(parentPath, parentRow)`.
- **Add Column** — append a field/column to **every record** of the relation (and to the header's `columns`), then
  write the whole relation.
- **Delete "‹column›" Column** — remove that column from the header and from **every** record, then write the whole
  relation.
- **Delete / Duplicate an item** — same whole-parent rewrite; `list-item` and `relation-item` are **positional**
  kinds, so Duplicate needs no rename and doubles as "insert a new one right after this one".

All of it goes through `commands/useRowCommands.ts` from Phase 2, which surfaces a returned `PortableError` as a
path-scoped inline error (edit rejected, focus kept, last-good row still visible) and fires `onChange` once per
successful commit.

**Render rows in the order the service returns** — sort order is applied in `normalize.ts`; never re-sort in React.

## 7. Files touched

```
src/components/boxed-editor/
├─ rows/ListRow.tsx           — NEW
├─ rows/ListItemRow.tsx       — NEW
├─ rows/RelationRow.tsx       — NEW (own column-header sub-grid)
├─ rows/RelationItemRow.tsx   — NEW (nested drill-down for complex cell values)
├─ rows/NewRow.tsx            — NEW (append placeholders)
├─ rows/RowSwitch.tsx         — extend with the four kinds
├─ commands/rowFactories.ts   — add list / list-item / relation / relation-item factories
└─ __tests__/row-kinds.test.tsx — NEW/extended
```

## 8. Tasks

- [ ] Ensure project compiles and existing tests are passing
- [ ] Add `rows/ListRow`, `ListItemRow`, `RelationRow` (own column-header sub-grid), `RelationItemRow` (nested
      drill-down when a cell value is a complex object)
- [ ] Add `rows/NewRow.tsx` and wire the [Append placeholders](#5-append-placeholders) table
- [ ] Add Add/Delete Column handling for `relation` (whole-parent rewrite via `setBoxedRowData`)
- [ ] Extend `__tests__/row-kinds.test.tsx` with list/relation cases, including a heterogeneous relation
- [ ] Mark all checkboxes as done in this document once verified

## 9. Verification

`__tests__/row-kinds.test.tsx` (real `MutableDecisionService` from `@edgerules/node`) covers:

- a scalar `list` with items, and item add / duplicate / delete via the placeholder and the commands;
- a `relation` with its column headers, records, add column and delete column;
- a **heterogeneous** relation — a record missing a field renders an empty cell, never a nested field row;
- a relation cell holding a complex object renders nested rows (drill-down), not JSON text;
- a computed array (`for … return …`) renders as a single `field` row, not as items.
