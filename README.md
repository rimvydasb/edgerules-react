# EdgeRules Components

This repository defines reusable React components and hooks for building applications that integrate with the EdgeRules
decision engine. Rule evaluation itself is not implemented here — components delegate to the EdgeRules WASM decision
engine via [`@edgerules/web`](https://www.npmjs.com/package/@edgerules/web), published from the
[`edgerules-v2`](../edgerules-v2) repository. It includes:

- EdgeRules Code Editor
- EdgeRules Boxed Editor
- EdgeRules Decision Table Editor
- EdgeRules Flow Editor (ReactFlow-based)
- EdgeRules Test Runner
- EdgeRules Types Editor
- [EdgeRules Project Explorer](docs/PROJECT_EXPLORER_STORY.md)

## General Notes

- All components are built with React and TypeScript.
- All components can be rendered in isolation or integrated into a larger application.
- All components are tested with React Testing Library and Playwright.

## Technical Stack

- [`@edgerules/web`](https://www.npmjs.com/package/@edgerules/web) for browser-side rule parsing, execution and CRUD
  against the EdgeRules Portable Format; [`@edgerules/portable`](https://www.npmjs.com/package/@edgerules/portable)
  for the corresponding TypeScript types (`PortableNode`, `PortableError`, `PortableRootContext`).
- Material UI (MUI) for UI components and theming.
- ReactFlow for flow-based visual programming.
- CodeMirror for code editing.
- MUI X Charts for data visualization.
- TypeScript, React
- Vitest and React Testing Library for unit/component testing; Playwright for end-to-end and visual testing.
- tsup for building the published npm package (dual ESM/CJS output with generated type declarations).
- Storybook for isolated component development and documentation.

## Project Structure

This repository is published to npm as a single package (`edgerules-react`). Each component is exposed as its own
subpath export (e.g. `edgerules-react/flow-editor`), so consumers only pull in the peer dependencies of the
components they actually import — a project that only uses the Code Editor never has to install `reactflow`.

```text
/
├── src/
│   ├── components/                # Reusable React components for EdgeRules
│   │   ├── boxed-editor/          # Boxed Expressions Editor
│   │   │   ├── index.ts           # Public exports for this component (its subpath entry point)
│   │   │   └── *.tsx              # Implementation, co-located unit tests (*.test.tsx)
│   │   ├── code-editor/           # Code Editor (CodeMirror)
│   │   ├── decision-table/        # Decision Table Editor
│   │   ├── flow-editor/           # Flow Editor (ReactFlow-based)
│   │   ├── project-explorer/      # Project Explorer
│   │   ├── test-runner/           # Test Runner
│   │   └── types-editor/          # Types Editor
│   ├── hooks/                     # Custom React hooks for EdgeRules
│   ├── lib/                       # Core logic and utilities shared across components
│   └── index.ts                   # Root barrel re-exporting the full public API
├── stories/                        # Storybook stories, mirroring the src/components layout
├── e2e/                            # Playwright end-to-end/visual tests
├── docs/                           # Design notes and feature specs (e.g. PROJECT_EXPLORER_STORY.md)
├── dist/                           # Build output (ESM + CJS + .d.ts), git-ignored, published to npm
├── package.json
├── tsconfig.json
├── tsup.config.ts                  # Library build config (multi-entry, one per component)
├── vitest.config.ts                # Unit test runner (+ React Testing Library)
├── playwright.config.ts
└── README.md                       # This file
```

Unit tests (React Testing Library) live next to the code they cover as `*.test.tsx`; Playwright specs live under
`e2e/` since they exercise built, running instances of the components rather than isolated units.

### Package & distribution conventions

- **Entry points**: `package.json` defines an `exports` map with one subpath per component
  (`edgerules-react/code-editor`, `edgerules-react/flow-editor`, ...) plus a root entry (`edgerules-react`) that
  re-exports everything for convenience.
- **Peer dependencies**: `react`, `react-dom`, `@mui/material` and other heavy, component-specific libraries
  (`reactflow`, `@codemirror/state`/`@codemirror/view`/`@codemirror/lint`, `@mui/x-charts`, `@mui/x-tree-view`) are declared as `peerDependencies`
  (most marked optional via `peerDependenciesMeta`), never bundled, so consuming apps control their own versions
  and bundle size.
- **Build output**: `tsup` builds dual ESM/CJS bundles with generated `.d.ts` files, one per component entry point,
  enabling tree-shaking. `sideEffects: false` is set in `package.json` (CSS files excluded) so bundlers can drop
  unused components entirely.
- **Published files**: only `dist/`, `README.md` and `LICENSE` are included via the `files` field — source,
  tests, stories and docs are not shipped to npm.
- **Engine dependency**: `@edgerules/web` (and its `@edgerules/portable` type dependency) is a regular
  `dependency`, not a peer — component behavior is tied to a specific engine API version, so it should not be
  left to the consuming app to resolve.