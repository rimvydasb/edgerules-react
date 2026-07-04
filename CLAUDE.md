# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`edgerules-react` provides reusable React/TypeScript components and hooks for building UIs on top of the EdgeRules
decision engine (Code Editor, Boxed Expressions Editor, Decision Table Editor, Flow Editor, Test Runner, Types
Editor, Project Explorer — see [README.md](README.md)). It is published to npm as a single package with a
subpath export per component (see README's "Project Structure" and "Package & distribution conventions" sections).

This repo contains **no runtime rule-evaluation logic of its own**. Executing EdgeRules code (parsing, running
decision tables, evaluating expressions) is delegated to the WASM decision engine published from the sibling
`edgerules-v2` repository, consumed here as an npm dependency:

- `@edgerules/web` — browser decision service (this is the one these components use)
- `@edgerules/portable` — the Portable JSON type definitions (`PortableNode`, `PortableError`,
  `PortableRootContext`, etc.) that these components render and edit

## EdgeRules Engine Documentation (sibling repo)

The engine's design docs live outside this repo, at `../edgerules-v2/doc/`. Read these before implementing anything
that touches the DSL, the Portable format, or the `DecisionService`/`MutableDecisionService` API surface — this repo
must stay a faithful client of contracts defined there, not redefine them.

- `../edgerules-v2/doc/architecture/ARCHITECTURE.md` — crate map and layered engine design; start here.
- `../edgerules-v2/doc/architecture/EDGERULES_API_SPEC.md` — authoritative `execute`/`get`/CRUD API surface exposed
  by `@edgerules/web`.
- `../edgerules-v2/doc/architecture/EDGERULES_CRUD_SPEC.md` — `set`/`remove`/`rename` semantics used by editors that
  mutate a model (Boxed Editor, Decision Table Editor, Types Editor, Project Explorer).
- `../edgerules-v2/doc/architecture/EDGERULES_DSL_SPEC.md` and `EDGERULES_DSL_CONTEXT_SPEC.md` — the DSL grammar and
  context/scoping model the Code Editor and Project Explorer need to reflect accurately.
- `../edgerules-v2/doc/architecture/EBNF.md` / `EBNF_PARSING_SPEC.md` — formal grammar, useful for syntax
  highlighting/autocomplete work in the Code Editor.
- `../edgerules-v2/doc/architecture/PRIMITIVES_SPEC.md`, `SPECIAL_VALUES_SPEC.md`, `DATETIME_SPEC.md` — value/type
  system details relevant to the Types Editor and any value renderers.
- `../edgerules-v2/doc/reference/` — end-user language reference (functions, decision tables, dates, types). Useful
  for building help text, autocomplete, and Test Runner examples that must match real engine behavior.
- `../edgerules-v2/doc/stories/NPM_PACKAGES_STORY.md` — how `@edgerules/portable`, `@edgerules/node`, and
  `@edgerules/web` are built and published; read this when upgrading the engine dependency or debugging why a type
  or export isn't available.
- `../edgerules-v2/doc/stories/` (remaining files) — implementation stories for engine features; check here if a
  component needs to depend on an engine capability that may still be in progress (e.g.
  `MUTABLE_DECISION_SERVICE_STORY.md` for CRUD readiness).

`*_SPEC.md` = completed/authoritative design; `*_STORY.md` = implementation story (may include in-progress work);
`*_REQ.md` = high-level requirements. Treat `_SPEC.md` files as the source of truth for contracts; treat `_STORY.md`
files as historical/in-progress context, not a guarantee of current shipped behavior — verify against the actual
installed `@edgerules/web`/`@edgerules/portable` version when in doubt.

## Coding Standards

- TypeScript + React function components; no class components.
- All new components ship with co-located `*.test.tsx` unit tests (React Testing Library) and a Storybook story.
- Keep component public APIs (props, exported types) intentionally small and stable — they become this package's
  npm surface. Anything not meant for consumers stays unexported from the component's `index.ts`.

## Tips

- This repo has no `node_modules`/build output committed; check `package.json` (once present) for the actual test
  and build commands rather than assuming.
- When a component needs to know exact engine behavior (error shapes, DSL edge cases, decision table semantics),
  check the corresponding spec in `../edgerules-v2/doc/` rather than inferring it from the component's own code.
