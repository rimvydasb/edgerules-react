# EdgeRules Components

This repository defines reusable React components and hooks for building applications that integrate with the EdgeRules
decision engine. It includes:

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

- Material UI (MUI) for UI components and theming.
- ReactFlow for flow-based visual programming.
- ACE Editor for code editing.
- MUI X Charts for data visualization.
- TypeScript, React
- React Testing Library, Playwright for testing.

## Project Structure

```text
/
├── components/             # Reusable React components for EdgeRules
│   ├── boxed-editor/       # Boxed Expressions Editor
│   ├── code-editor/        # Code Editor (ACE Editor)
│   ├── decision-table/     # Decision Table Editor
│   ├── flow-editor/        # Flow Editor (ReactFlow-based)
│   ├── project-explorer/   # Project Explorer
│   ├── test-runner/        # Test Runner
│   └── types-editor/       # Types Editor
├── hooks/                  # Custom React hooks for EdgeRules
├── lib/                    # Core logic and utilities for EdgeRules
├── docs/                   # Storybook stories for components
├── tests/                  # Unit and integration tests
└── README.md               # This file
```