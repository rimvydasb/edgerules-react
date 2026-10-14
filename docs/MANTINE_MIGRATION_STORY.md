# Mantine Migration

## Summary

The library uses Mantine for UI components and plain elements for repeated grid cells. The goal is layout flexibility
and render speed.

## Technical Breakdown

- **Mantine:** dialogs, menus, tooltips, selects, alerts, notifications, buttons, and the Project Explorer tree.
- **Plain elements:** grid rows and cells, in-cell inputs, and layout wrappers. CSS modules style them with Mantine CSS
  variables (`--mantine-color-*`).
- **Icons:** `@tabler/icons-react` replaces `@mui/icons-material`.
- **Peers:** `@mantine/core` and `@mantine/hooks` replace `@mui/*` and `@emotion/*`.

Plain cells MUST NOT use a UI library component. Library components MAY sit in cells only as overlays, such as a cell
menu or a tooltip.

Benchmark for 5000 grid cells (median ms, production build, headless Chromium):

| Variant                         | Mount | Rerender |
|---------------------------------|-------|----------|
| MUI `TextField` with `sx`       | 1113  | 413      |
| Mantine `TextInput`             | 331   | 183      |
| Plain `<input>` with CSS        | 59    | 33       |

### Grid Visual Rules

The grids keep the current visual style: colors, fonts, spacing, and the blue header column. The rules below fix the
defects in [boxed-editor/img.png](boxed-editor/img.png).

| Rule              | Requirement                                                                              |
|-------------------|------------------------------------------------------------------------------------------|
| Single border     | Two adjacent cells MUST share one 1px solid border. Nested grids MUST NOT add a second line. |
| Edge alignment    | Column edges MUST align across rows and nested grids, with zero pixel offset.             |
| Border color      | All grid borders MUST use one CSS variable, such as `--mantine-color-default-border`.     |
| Row height        | Rows of the same kind MUST have the same height.                                           |
| Focus outline     | A focused cell input MUST draw its outline inside the cell, on the cell border box.       |
| Error popover     | An error popover MUST align to the left edge of its cell and MUST NOT be clipped.        |
| Header column     | The colored header column MUST touch the grid border, with no gap and no double line.     |
| Step grid         | Every column width and row height MUST be a whole multiple of `GRID_STEP` (40px), nested sub-columns included. |
| Line width        | Every grid line MUST be 1px. Groups MUST be told apart by tint, not by a thicker line.    |
| Line drawing      | Every line MUST be a CSS border with exactly one owner box. A line MUST NOT be a filled box: browsers snap borders to device pixels, not filled boxes. |
| Block boundary    | Every row that opens a nested level (`isBlock` in `primitives/layout.ts`) MUST close its group with one double line, drawn inside the last row. No other line MAY be double. |
| Code coloring     | A display cell that holds DSL text MUST render it with `HighlightedCode`.                 |

> Clarification: Use `border-collapse: collapse`, or draw only the right and bottom border of each cell. Do not give a
> nested grid its own outer border.

> Clarification: The grids are a ruled sheet like squared paper. In the Boxed Editor each cell draws its 1px line
> on its own last pixel, so every line falls on `k * 40 - 1`. A nested sub-grid (`primitives/SubGrid.tsx`) sits in a
> flush value cell and gets whole-step track widths from one shared plan (`primitives/layout.ts`); a ruleset's
> header, rule, and default rows all use the same `RulesetTracks`. The value column widens in whole steps when a
> sub-grid needs more room. The Decision Table uses `GridTable` `columnUnits`. A cell whose text wraps grows taller
> than one step; its lines stay aligned because the table shares borders.

### Visual Review by the Agent

The developer agent MUST check the result visually, not only with DOM tests.

- **Playwright screenshots:** `e2e/visual/*.spec.ts` captures each Storybook story with `toHaveScreenshot()`.
- **Agent inspection:** the agent opens each screenshot with the `Read` tool and checks it against `### Grid Visual Rules`.
- **Zoom check:** the agent captures the boxed editor and decision table at device scale factor 2. Double lines and
  1px offsets are visible only at this scale.
- **Interactive check:** the agent MAY use Claude in Chrome on `npm run storybook` for focus and error states.

## Limitations

- Screenshot baselines depend on the OS and the browser version. Baselines MUST come from one environment.

## Architecture Changes

- `README.md` and `docs/ARCHITECTURE.md` name Mantine as the UI library.
- `docs/architecture-adr.md` records the decision and the benchmark.

## Out of Scope

- React Flow canvas for connected decision metaphors.

## Verification

| Check     | Command                   |
|-----------|---------------------------|
| Build     | `npm run build`           |
| Typecheck | `npm run typecheck`       |
| Format    | `npm run format:check`    |
| Test      | `npm test`                |
| E2E       | `npm run e2e`             |
| Visual    | `npx playwright test e2e/visual` |
| Start     | `npm run storybook`       |

## Tasks

**Phase 1: Grid cells**

- [x] Ensure project compiles and existing tests are passing
- [x] Add plain cell primitives with CSS modules for Decision Table and Tests Manager grids
- [x] Replace MUI `Table*`, `TextField`, and `InputBase` in grid cells with the cell primitives
- [x] Add tests for the code of this phase

Acceptance criteria:

- [x] `npm test` passes, including `DecisionTableEditor.test.tsx` and `TestsManager.test.tsx`

**Phase 2: Mantine components**

- [x] Replace the remaining MUI components and icons with Mantine and Tabler
- [x] Replace `@mui/x-tree-view` with Mantine `Tree` in `ProjectExplorer`
- [x] Update `peerDependencies` and Storybook decorators with `MantineProvider`
- [x] Add tests for the code of this phase

Acceptance criteria:

- [x] `grep -r "@mui\|@emotion" src stories` returns no result
- [x] `npm test` passes

**Phase 3: Grid visual quality**

- [x] Add `e2e/visual` screenshot specs for the boxed editor, decision table, and tests manager stories
- [x] Include states: default, focused cell, cell with an error popover, nested grid, and empty `(new item)` row
- [x] Capture each grid at device scale factor 1 and 2
- [x] Fix every violation of `### Grid Visual Rules`, and keep the current visual style
- [x] Inspect each screenshot with the `Read` tool, and list the remaining defects in the PR description
- [x] Commit the reviewed screenshots as baselines

Acceptance criteria:

- [x] `npx playwright test e2e/visual` passes
- [x] Screenshot of the error state in the boxed editor shows no defect from [boxed-editor/img.png](boxed-editor/img.png)
- [x] At scale factor 2, no screenshot shows a double border or a misaligned column edge

**Phase E2E:**

- [x] Update E2E tests for changed selectors

Acceptance criteria:

- [x] `npm run e2e` passes

**Phase X:**

- [x] Update `README.md` and `docs/ARCHITECTURE.md` with the changes from `## Architecture Changes`
- [x] Add the decision to `docs/architecture-adr.md`
- [x] Review the implementation against this story and the project conventions

Acceptance criteria:

- [ ] Every command in `## Verification` passes (`npm run build` still fails in the `.d.ts` step: TypeScript 7 vs `rollup-plugin-dts`, same on the commit before this migration)
- [x] Storybook starts with `npm run storybook`
