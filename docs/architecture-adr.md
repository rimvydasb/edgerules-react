# Architecture Decision Records

## ADR-001: Mantine for UI, plain elements for grid cells

**Status:** accepted.

### Context

The grids render thousands of cells. MUI `TextField` with `sx` was the main cost, and MUI's table borders produced
double lines in nested grids.

Benchmark for 5000 grid cells (median ms, production build, headless Chromium):

| Variant                   | Mount | Rerender |
|---------------------------|-------|----------|
| MUI `TextField` with `sx` | 1113  | 413      |
| Mantine `TextInput`       | 331   | 183      |
| Plain `<input>` with CSS  | 59    | 33       |

### Decision

- Use Mantine (`@mantine/core`, `@mantine/hooks`) for dialogs, menus, tooltips, selects, alerts, buttons and the
  Project Explorer tree. Use `@tabler/icons-react` for icons.
- Use plain elements with CSS Modules for grid rows, cells, in-cell inputs and layout wrappers. CSS Modules use
  Mantine CSS variables so themes apply.
- A cell MUST NOT use a UI library component. A library component MAY sit in a cell only as an overlay.
- Drop `@mui/*` and `@emotion/*` peer dependencies. Public `sx` props become `style`.
- The build bundles CSS Modules into the JS and injects them at runtime (`tsup.config.ts`), so consumers import
  only `@mantine/core/styles.css`.

### Consequences

- Hosts MUST render a `MantineProvider`.
- Screenshot baselines in `e2e/visual` depend on OS and browser build; create them in one environment.
