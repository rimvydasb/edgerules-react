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
| Start     | `npm run storybook`       |

## Tasks

**Phase 1: Grid cells**

- [ ] Ensure project compiles and existing tests are passing
- [ ] Add plain cell primitives with CSS modules for Decision Table and Tests Manager grids
- [ ] Replace MUI `Table*`, `TextField`, and `InputBase` in grid cells with the cell primitives
- [ ] Add tests for the code of this phase

Acceptance criteria:

- [ ] `npm test` passes, including `DecisionTableEditor.test.tsx` and `TestsManager.test.tsx`

**Phase 2: Mantine components**

- [ ] Replace the remaining MUI components and icons with Mantine and Tabler
- [ ] Replace `@mui/x-tree-view` with Mantine `Tree` in `ProjectExplorer`
- [ ] Update `peerDependencies` and Storybook decorators with `MantineProvider`
- [ ] Add tests for the code of this phase

Acceptance criteria:

- [ ] `grep -r "@mui\|@emotion" src stories` returns no result
- [ ] `npm test` passes

**Phase E2E:**

- [ ] Update E2E tests for changed selectors

Acceptance criteria:

- [ ] `npm run e2e` passes

**Phase X:**

- [ ] Update `README.md` and `docs/ARCHITECTURE.md` with the changes from `## Architecture Changes`
- [ ] Add the decision to `docs/architecture-adr.md`
- [ ] Review the implementation against this story and the project conventions

Acceptance criteria:

- [ ] Every command in `## Verification` passes
- [ ] Storybook starts with `npm run storybook`
