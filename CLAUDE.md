# CLAUDE.md

Guidance for Claude Code in this repository.

## Project Overview

`edgerules-react` is a React/TypeScript component library (Code Editor, Boxed Editor, Decision Table Editor, Flow
Editor, Test Runner, Types Editor, Project Explorer — see [README.md](README.md)) published to npm as one package
with a subpath export per component. It has **no rule-evaluation logic of its own** — execution is delegated to the
WASM engine from the sibling `edgerules-v2` repo, via `@edgerules/web` (browser decision service) and
`@edgerules/portable` (shared TS types: `PortableNode`, `PortableError`, `PortableRootContext`).

## Engine references (sibling repo, not in this checkout)

Don't redefine DSL/Portable-format/API contracts — they're owned by `edgerules-v2`. Check there first:

- `../edgerules-v2/doc/architecture/` — design specs (`ARCHITECTURE.md` first; `EDGERULES_API_SPEC.md` and
  `EDGERULES_CRUD_SPEC.md` for the `execute`/`get`/`set`/`remove`/`rename` API; `EDGERULES_DSL_SPEC.md`/`EBNF.md` for
  grammar). `*_SPEC.md` = authoritative; `*_STORY.md` = implementation history, may be stale — verify against the
  installed package version.
- `../edgerules-v2/doc/reference/` — end-user language/function reference.
- **`../edgerules-v2/tests/wasm/`** — best syntax/usage reference: real, CI-run TypeScript examples of every DSL
  feature and built-in (one test file per feature/function family, plus full model fixtures in `models/`). Prefer
  this over prose docs for concrete, guaranteed-correct examples — if it ever disagrees with a reference doc, trust
  the test.

## Coding Standards

- TypeScript + React function components only.
- New components: co-located `*.test.tsx` (RTL) + a Storybook story.
- Keep exported props/types minimal — they become the npm public API.
