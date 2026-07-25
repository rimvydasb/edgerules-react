# Boxed Editor Service

## Summary

Implement `BoxedEditorService` — the normalizing facade over `MutableDecisionService` described in
[`BOXED_EDITOR_SPEC.md`](BOXED_EDITOR_SPEC.md)'s ["Service composition"](BOXED_EDITOR_SPEC.md#service-composition) and
[`BoxedEditorService` API](BOXED_EDITOR_SPEC.md#boxededitorservice-api) sections: the
`createBoxedEditorService(mutable)`
factory, Portable ⇄ `BoxedRowData` normalization/denormalization, a per-path row cache, and CRUD delegation
(`get`/`set`/`remove`/`rename`/`move`/`subscribe`/`toPortable`).

This is the data/service layer only — **no React**. It is the load-bearing dependency every later `BoxedEditor` UI
story (rows, cells, hooks, drag-and-drop, menus) is built against, and completing it is also what makes the package
build: `package.json`'s `./boxed-editor` export and `tsup.config.ts`'s `components/boxed-editor/index` entry already
exist and point at `src/components/boxed-editor/index.ts`, which does not exist yet (the directory currently holds
only a stray `.DS_Store`) — `npm run build` cannot succeed for this package until that file exists.

**No repository-wide `ARCHITECTURE.md` exists in this checkout** (checked `docs/` and the repo root). Per the
`/new-story` process this document would normally update it; since there is nothing to update, this note stands in
for that step. If a cross-component architecture document is wanted, run the `new-architecture` skill separately —
that is a repo-wide concern, not something one component's service story should originate.

**Out of scope** (left to a follow-up story): `BoxedEditor.tsx`, all `rows/`, `cells/`, `primitives/`, `menu/`, `dnd/`,
context providers, hooks, `DocumentationService`, `TestCasesService`. Those consume this service; none of them are
touched here.

## Technical Breakdown

### Files

```
src/components/boxed-editor/
├─ index.ts                          — public exports (see Component API note below)
├─ boxed-editor-types.ts             — BoxedEditorService, BoxedRowData, BoxedRowKind, BoxedTableRowData,
│                                       SignatureParameter (all public, per BOXED_EDITOR_SPEC.md)
├─ service/
│  ├─ createBoxedEditorService.ts    — factory: MutableDecisionService -> BoxedEditorService
│  ├─ normalize.ts                   — Portable -> BoxedRowData[] / BoxedRowData (Normalization Rules)
│  ├─ denormalize.ts                 — BoxedRowData -> PortableNode (inverse of normalize.ts)
│  └─ rowCache.ts                    — per-path memoized row cache; explicit invalidate(path?)
└─ __tests__/
   ├─ normalization.test.ts          — Portable -> BoxedRowData: sort order, relation-vs-list classification,
   │                                    metadata stripping, function-result synthesis
   ├─ mutation.test.ts               — setBoxedRowData / remove / rename round trips, PortableError passthrough,
   │                                    subscribe notifications, cache referential-stability
   └─ move.test.ts                   — reorder and reparent, insert-then-remove ordering, partial-failure behavior
```

`rows/`, `cells/`, `primitives/`, `menu/`, `dnd/`, `hooks/`, `context/`, and `BoxedEditor.tsx` from the full spec's
component tree are **not** created in this story.

### Normalization (`normalize.ts`)

Reads via `mutable.get(path, 'ALL')` and maps the returned `PortableNode` tree to `BoxedRowData[]`, applying
[Normalization Rules](BOXED_EDITOR_SPEC.md#normalization-rules) exactly:

| Rule                   | Behavior                                                                                                                                                                                                                  |
|------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Sort order             | `complexType` → `function` → `ruleset` → `optimisation` → everything else (`context`/`list`/`relation`/`field`), each group in source order; a function body's synthesized `result` field sorts last within that function |
| Relation vs. list      | scalar array items → `list`/`list-item`; complex-object array items → `relation`/`relation-item` with `columns` as the ordered union of every field seen across records                                                   |
| Metadata               | `@kind`, `@description`, `@node`, `@node-name`, `@model-name`, `@model-version` never become child rows; `@node`/`@node-name` are not yet surfaced on `BoxedRowData` at all — see [Open Questions](#open-questions) #1    |
| Row-kind consolidation | class field / typed input / plain expression / invocation Portable nodes all collapse to the single `field` `BoxedRowKind`                                                                                                |
| Inline functions       | a function whose `@body` is a bare `PortableExpression` (not a `PortableContext`) is normalized with a synthesized `function-result` child row so the shape matches a multi-statement function body                       |

`getBoxedRowsData(path)` and `getBoxedRowData(path)` are pure reads of the cache (below); they never call `mutable.get`
directly — the cache does, on miss.

### Row cache (`rowCache.ts`)

- One cache keyed by `path`, populated lazily on first read via `normalize()`.
- `getBoxedRowsData`/`getBoxedRowData` must return a **referentially stable** array/object when nothing under `path`
  changed, so a future `useSyncExternalStore` consumer doesn't re-render or loop (spec's
  ["Reactivity requirements"](BOXED_EDITOR_SPEC.md#react-integration)).
- Every mutation (`setBoxedRowData`/`remove`/`rename`/`move`) invalidates exactly the entries whose subtree changed
  (the mutated path, every ancestor path up to root since a child changed, and — for `rename`/`move` — every path
  ever cached at or under the old location).
- Exposes an internal `invalidate(path?: string)` (no-arg = wholesale clear) that `createBoxedEditorService` calls
  after every commit. **This method is not on the public `BoxedEditorService` interface in the spec** — see
  [Open Questions](#open-questions) #2 for whether a future host-triggered revalidation hook needs one.

### Denormalization (`denormalize.ts`) and the whole-node `set` strategy

`setBoxedRowData(path, row)` denormalizes the **entire row, including its `children`,** into one `PortableNode` and
issues exactly one `mutable.set(path, node)`. This is deliberate, not incidental, and follows the same strategy
already validated for `ruleset` in `DECISION_TABLE_STORY.md` ("structural edits → whole-ruleset `set`"), for two
engine reasons confirmed against `../edgerules-v2/doc/architecture/CRUD_SPEC.md`:

1. **Arrays are append-only; gaps are rejected** (`ResolvedLocation::NewListElement` — "New tail slot (gaps rejected
   → `WrongFieldPath`)"). There is no engine primitive to insert or reorder at an arbitrary array index, so
   `list`/`relation`/`rule`/`optimisation-variable`/`optimisation-constraint` container edits (add/remove/reorder a
   child) must rewrite the whole parent array in one `set`, not touch one element at an index.
2. **Cell text is expression-wrapped, never DSL-parsed client-side.** Per
   [Cell value mapping](BOXED_EDITOR_SPEC.md#cell-value-mapping), a `field`'s `value` can denote a plain expression, a
   type constraint (`<number, required: true>`), or an invocation call — three different Portable node kinds — but
   the view "never parses DSL itself." `denormalize.ts` always wraps such text as
   `{ '@kind': 'expression', expression: text }` and lets the engine's own parser resolve it to the concrete node kind
   on `set`; a subsequent `get` (feeding the next `normalize()`) reports back whichever kind the engine actually
   linked. **This is an inference from the spec's wording, not something confirmed against the live engine yet** —
   Phase 2 includes a task to verify it against `@edgerules/node` and, if it doesn't round-trip, file the gap in
   `docs/BUG_REPORTS.md` rather than working around it silently.

`remove(path)` and `rename(path, newName)` delegate straight to `mutable.remove`/`mutable.rename` — no denormalization
needed, since neither takes a node body.

### `move(fromPath, toParentPath, index)`

The engine has no native move/reparent/reorder primitive (confirmed: `CRUD_SPEC.md` lists only
`get`/`set`/`remove`/`rename`). `move` is composed from those four, in an order chosen to fail safe:

```mermaid
sequenceDiagram
    participant Caller
    participant BoxedEditorService as facade
    participant MutableDecisionService as engine
    Caller ->> facade: move(fromPath, toParentPath, index)
    facade ->> engine: get(fromPath, "ALL")
    engine -->> facade: sourceNode
    facade ->> engine: get(toParentPath, "ALL")
    engine -->> facade: destNode (container)
    facade ->> facade: splice sourceNode into destNode's children at index
    facade ->> engine: set(toParentPath, destNode) %% insert first
    alt insert fails
        engine -->> facade: PortableError
        facade -->> Caller: PortableError (source untouched, nothing removed)
    else insert succeeds
        engine -->> facade: PortableNode
        facade ->> engine: remove(fromPath) %% then remove the source
        alt remove fails
            engine -->> facade: PortableError
            facade -->> Caller: PortableError (duplicate now exists at both locations)
        else remove succeeds
            facade ->> facade: invalidate(fromPath), invalidate(toParentPath)
            facade -->> Caller: void (success)
        end
    end
```

**Insert-then-remove, not remove-then-insert.** If the insert fails, the source is still exactly where it was — the
caller sees an ordinary `PortableError` and nothing is lost. If the (unlikely) remove fails after a successful
insert, the model now has the row in both places; the facade returns that `PortableError` verbatim rather than
attempting a compensating rollback, following the same no-silent-rollback philosophy the engine itself uses for CRUD
writes ([Resolved Decision #12](BOXED_EDITOR_SPEC.md#resolved-decisions): partial failure surfaces as an ordinary
path-scoped error, it does not reverse prior steps). A duplicate-on-partial-failure is strictly safer than a
lost-on-partial-failure row, which is why the order is insert-first.

Reordering within the *same* parent (`fromPath` and `toParentPath` share a parent) is the same algorithm with
`toParentPath == ` the shared parent — splice-out-then-splice-in inside one already-read `destNode`, still one
`set`.

**Scope boundary:** `move` performs the mechanical splice only. It does not enforce the DMN-shape validity rules
listed in the spec's [Drag and Drop](BOXED_EDITOR_SPEC.md#drag-and-drop) section (e.g. "`rule` → only its own
`ruleset`, and only as a reorder"). That semantic gate is `dropRules.ts`, owned by the future drag-and-drop story, so
the same pure function can gate both the drag preview and the actual `move()` call without the two ever disagreeing.
Calling `move()` directly with a structurally invalid target is expected to surface as an engine `PortableError`
(e.g. `WrongFieldPath`/`Linking`) in most cases, but is **not** guaranteed to be rejected by this service alone.

### Error handling

Mirrors the spec's [Error handling](BOXED_EDITOR_SPEC.md#error-handling) split, at the level this service can act on:

- A bad `path` passed to `getBoxedRowsData`/`getBoxedRowData` (does not resolve) returns `undefined`/`[]` — fatal
  handling (replacing UI with an alert) is the future `BoxedEditor` component's job, not this facade's.
- `setBoxedRowData`/`remove`/`rename`/`move` return the engine's `PortableError` verbatim on failure and leave the
  cache untouched for that path (no invalidation on failure, so the last-good cached row stays visible).
- Per [Resolved Decision #12](BOXED_EDITOR_SPEC.md#resolved-decisions), a structurally-successful write that breaks a
  reference elsewhere is **not** rolled back — this facade does not re-validate the whole model after every write.

### Structural Diagram

```mermaid
classDiagram
    class BoxedEditorService {
        <<facade>>
        +getBoxedRowsData(path) BoxedRowData[]
        +getBoxedRowData(path) BoxedRowData?
        +setBoxedRowData(path, row) PortableNode|PortableError
        +remove(path) void|PortableError
        +rename(path, newName) void|PortableError
        +move(fromPath, toParentPath, index) void|PortableError
        +subscribe(listener) Unsubscribe
        +toPortable() PortableRootContext
    }
    class RowCache {
        <<internal>>
        +get(path) BoxedRowData[]?
        +invalidate(path?) void
    }
    class MutableDecisionService {
        <<engine>>
        +get(path, filter?) PortableNode|PortableError
        +set(path, node) PortableNode|PortableError
        +remove(path) void|PortableError
        +rename(path, newName) void|PortableError
        +toPortable() PortableRootContext
    }
    BoxedEditorService --> RowCache: read-through
    BoxedEditorService --> MutableDecisionService: get / set / remove / rename / toPortable
    RowCache --> MutableDecisionService: get (on cache miss, via normalize())
```

### Behavioral Diagram

```mermaid
sequenceDiagram
    participant Caller
    participant BoxedEditorService as facade
    participant MutableDecisionService as engine
    Caller ->> facade: setBoxedRowData(path, row)
    facade ->> facade: denormalize(row) -> PortableNode
    facade ->> engine: set(path, node)
    alt PortableError
        engine -->> facade: PortableError
        facade -->> Caller: PortableError (cache untouched)
    else success
        engine -->> facade: PortableNode (linked, type-enriched)
        facade ->> facade: cache.invalidate(path)
        facade ->> facade: notify subscribe() listeners
        facade -->> Caller: PortableNode
    end
```

## Out of Scope

- `BoxedEditor.tsx` and everything under `rows/`, `cells/`, `primitives/`, `menu/`, `dnd/`, `hooks/`, `context/`.
- `DocumentationService`, `TestCasesService`, and any IndexedDB overlay.
- `dropRules.ts` DnD-validity gating (see move()'s scope boundary above).
- Repo-wide `ARCHITECTURE.md` (none exists; see Summary).

## Tasks

**Phase 1: Types + normalized read path**

- [ ] Ensure project compiles and existing tests are passing
- [ ] Add `boxed-editor-types.ts`: `BoxedRowKind`, `BoxedRowData`, `BoxedTableRowData`, `SignatureParameter`
- [ ] Add `service/normalize.ts`: Portable → `BoxedRowData[]` / `BoxedRowData`, applying sort order, relation-vs-list
  classification, metadata stripping, row-kind consolidation, and function-result synthesis
- [ ] Add `service/rowCache.ts`: per-path memoized cache with `get`/`invalidate`
- [ ] Add `service/createBoxedEditorService.ts` implementing `getBoxedRowsData`, `getBoxedRowData`, `toPortable`,
  `subscribe` against the cache; `setBoxedRowData`/`remove`/`rename`/`move` may stub a
  `NotImplemented`-style `PortableError` in this phase, replaced in Phases 2–3
- [ ] Add `index.ts` exporting the Phase 1 public surface (fixes the `./boxed-editor` package export / tsup entry)
- [ ] Add `__tests__/normalization.test.ts` against a real `@edgerules/node` `MutableDecisionService.fromCode(...)` —
  cover every `BoxedRowKind` including `ruleset`/`optimisation` families, sort order, relation vs. list, and
  metadata stripping
- [ ] `npm run build` succeeds with the `boxed-editor` entry now resolvable
- [ ] Mark all checkboxes as done in this document once verified

**Phase 2: Mutations (set / remove / rename) and reactivity**

- [ ] Ensure project compiles and existing tests are passing
- [ ] Add `service/denormalize.ts`: `BoxedRowData` (recursively, including `children`) → `PortableNode`, per row kind
- [ ] Verify against `@edgerules/node` that expression-wrapped type-constraint and invocation text round-trips
  through `set` → `get` to the correct concrete Portable `@kind`; file a `docs/BUG_REPORTS.md` entry if it
  doesn't and adjust `denormalize.ts` accordingly
- [ ] Implement `setBoxedRowData`, `remove`, `rename` on the facade: denormalize → delegate to `mutable` →
  cache-invalidate the affected path(s) on success only → notify `subscribe` listeners once per successful commit
- [ ] Add `__tests__/mutation.test.ts`: real-engine round trips for `field`/`context`/`complexType`/`list`/
  `relation`/`function`/`ruleset`/`optimisation` rows; `PortableError` passthrough with cache left untouched;
  exactly one `subscribe` notification per successful commit; referential stability of unaffected cached paths
- [ ] Mark all checkboxes as done in this document once verified

**Phase 3: `move`**

- [ ] Ensure project compiles and existing tests are passing
- [ ] Implement `move(fromPath, toParentPath, index)`: insert-then-remove ordering, whole-parent-node rewrite,
  same-parent reorder as a special case of the same algorithm
- [ ] Add `__tests__/move.test.ts`: reorder within an array-shaped parent (`list-item`/`relation-item`/`rule`/
  `optimisation-variable`/`optimisation-constraint`); reparent a `field`/`context`/`function` into another
  `context`; insert-failure leaves the source untouched; remove-failure-after-insert surfaces the `PortableError`
  with the duplicate documented as expected
- [ ] Mark all checkboxes as done in this document once verified

**Phase 4: Quality gate**

- [ ] Ensure project compiles and existing tests are passing
- [ ] Resolve [Open Questions](#open-questions) below (or record the architect's decision inline in this document,
  matching the style already used for BOXED_EDITOR_SPEC.md's own open questions)
- [ ] Update `docs/BUG_REPORTS.md` with any engine gaps found during Phases 1–3
- [ ] Update required documentation after the implementation is complete (this story's checkboxes, and
  `BOXED_EDITOR_SPEC.md` itself if implementation revealed a spec inaccuracy)
- [ ] Ensure new tests are added for the new feature and all tests are passing
- [ ] Perform linting and formatting to maintain code quality and consistency (`npm run format`, `npm run typecheck`)
- [ ] Review the implementation to ensure it meets the requirements and follows best practices
- [ ] Mark all checkboxes as done in this document once verified

## Open Questions

1. **Are `BoxedRowData`, `BoxedRowKind`, `BoxedTableRowData`, `SignatureParameter`, and `createBoxedEditorService`
   part of the public export surface?** `BOXED_EDITOR_SPEC.md`'s "Export surface" note lists only `BoxedEditor`,
   `BoxedEditorProps`, `BoxedEditorService`, `BoxedEditorOpenTarget`, `BoxedEditorTargetKind`, and the overlay service
   contracts — it does not name these types. But `BoxedEditorService`'s own methods return `BoxedRowData`/
   `BoxedRowData[]`, so a host consuming `BoxedEditorService` from outside this package cannot use it at all unless
   `BoxedRowData` (and transitively `BoxedRowKind`/`BoxedTableRowData`/`SignatureParameter`) is also exported. This
   reads like an omission in the enumeration rather than a deliberate exclusion.
   Option 1 (recommended): export all four types from `index.ts` alongside `BoxedEditorService`, since they're
   required for the interface to be usable at all; also export `createBoxedEditorService` as the spec's own React
   integration section already calls it "a convenience" for hosts.
   Option 2: keep the export surface exactly as literally enumerated, and have hosts treat `BoxedEditorService`'s
   return values as structurally-typed but not nominally importable (awkward, not recommended).
   This story proceeds with **Option 1** absent a correction.

> Architect notes: export all four types from `index.ts` alongside `BoxedEditorService`

2. **Does the public `BoxedEditorService` interface need a host-triggered revalidation method?** The spec's
   `rowCache.ts` line says the cache is "invalidated wholesale when `revision` changes," but `revision` is a
   `BoxedEditorProps` (React-layer) concept, and the `BoxedEditorService` interface in the spec has no
   `invalidate`/`refresh` method. This story adds an **internal-only** `invalidate(path?)` on the cache so a future
   `BoxedEditorContext`/provider has something to call when the host's `revision` prop changes, but does not put it
   on the public `BoxedEditorService` interface. Confirm this is the right layering before the follow-up React story
   builds on it — the alternative is exposing `invalidate` (or recreating the whole facade) as part of this story's
   public contract instead.

> Architect notes: there will be integration to ReactFlow, that means that the React layer will have to be able to
> trigger a revalidation of the cache.