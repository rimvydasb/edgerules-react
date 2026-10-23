# Additional Note For Agents

## Project Overview

`edgerules-react` is a React/TypeScript component library (Code Editor, Boxed Editor, Decision Table Editor, Flow
Editor, Test Runner, Types Editor, Project Explorer — see [README.md](README.md)) published to npm as one package with a
subpath export per component. It has **no rule-evaluation logic of its own** — execution is delegated to the WASM engine
from the sibling `edgerules` repo, via `@edgerules/web` (browser decision service) and `@edgerules/portable` (shared
TS types: `PortableNode`, `PortableError`, `PortableRootContext`).

## Engine references (sibling repo, not in this checkout)

Don't redefine DSL/Portable-format/API contracts — they're owned by `edgerules`. Check there first:

- `../edgerules/doc/architecture/` — design specs (`ARCHITECTURE.md` first; `API_SPEC.md` and `CRUD_SPEC.md` for the
  `execute`/`get`/`set`/`remove`/`rename` API and the linking/`tast_dirty` contract; `dsl/`+`EBNF.md` for grammar).
  `*_SPEC.md` = authoritative; `*_STORY.md` = implementation history, may be stale — verify against the installed
  package version.
- `../edgerules/doc/reference/` — end-user language/function reference.
- **`../edgerules/tests/wasm/`** — best syntax/usage reference: real, CI-run TypeScript examples of every DSL feature
  and built-in (one test file per feature/function family, plus full model fixtures in `models/`). Prefer this over
  prose docs for concrete, guaranteed-correct examples — if it ever disagrees with a reference doc, trust the test.

## Bug Reporting

EdgeRules WASM, DSL and WASM API might have bugs. Check for the latest version in
`https://www.npmjs.com/package/@edgerules/web?activeTab=versions` and review `../edgerules/` if necessary. For any
detected bugs, append `docs/engine-bug-reports.md` with a new entry describing the bug.

## Coding Standards

- TypeScript + React function components only.
- New components: `*.test.tsx`/`*.test.ts` (RTL) in a component-local `__tests__/` folder + a Storybook story.
- Keep exported props/types minimal — they become the npm public API.
- Format with Prettier (`.prettierrc.json`): `npm run format` to write, `npm run format:check` to verify (CI-style). A
  project `PostToolUse` hook (`.claude/settings.json`) runs `prettier --write` on every file you edit/write.
- Markdown file names are lowercase, words separated by `-` (e.g. `flow-editor-story.md`, never `FLOW_EDITOR_STORY.md`);
  only tool-mandated names (`README.md`, `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `CHANGELOG.md`) are exempt.
- Architecture rules (layers, component public API and allowlists, no cycles, engine boundary, optional peer
  dependencies, test isolation, markdown names) are enforced by dependency-cruiser — see `docs/architecture.md`
  "Dependency-cruiser enforces the dependency rules". `npm run depcruise` checks them (part of `npm run check`); the
  `Stop`/`SubagentStop` hook (`.claude/hooks/check.sh`) runs it every time an agent finishes. Each violation message
  says how to fix it. Never silence a new violation by editing the rules or the baseline
  (`.dependency-cruiser-known-violations.json`) — fix the import; after fixing a recorded one, run
  `npm run depcruise:baseline` so the baseline only shrinks.
- A component's `index.ts` is its npm public API; `internal.ts` is what other components of this package may import (not
  published). Grid row/cell files may use only overlay Mantine components (`.oxlintrc.json`).
