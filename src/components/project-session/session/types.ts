import type { Unsubscribe } from '../../../lib/changeBatch';
import type {
  DocumentationDocument,
  FlowMetadataDocument,
  ProjectBundle,
  ProjectLocator,
  SaveResult,
  TestSuitesDocument,
} from '../bundle/types';
import type { ProjectEngine } from '../engine/types';
import type { ProjectError } from '../errors';
import type { DocumentationStore, FlowMetadataStore, ProjectTestsStore } from '../stores/types';

export type ProjectSlice = 'model' | 'documentation' | 'tests' | 'flow';

// 'ready' covers both clean and dirty; `dirtySlices` tells them apart.
export type ProjectSessionPhase = 'ready' | 'saving' | 'conflict' | 'closed';

// The last `commitDsl`. An invalid draft stays editable but blocks export and save.
export type DslValidity = { status: 'valid' } | { status: 'invalid'; message: string };

// Immutable; the same object until something observable changes.
export interface ProjectSessionSnapshot {
  phase: ProjectSessionPhase;
  projectId: string;
  name: string;
  locator: ProjectLocator;
  revision: string; // the repository revision this working copy is based on
  localVersion: number; // increments with every change of any slice
  dirtySlices: readonly ProjectSlice[]; // changed since the last load or save
  dslValidity: DslValidity;
  hasDslDraft: boolean; // DSL text is set that is not committed
}

export interface ModelSnapshot {
  version: number; // increments with every model change; pass it as an editor's `revision`
  dsl: string; // the committed model as canonical DSL
}

export interface ProjectSliceSnapshots {
  model: ModelSnapshot;
  documentation: DocumentationDocument;
  tests: TestSuitesDocument;
  flow: FlowMetadataDocument;
}

export type ProjectCommand =
  // Replaces the model with `source` when it parses and links; otherwise keeps it as an invalid draft.
  | { type: 'commitDsl'; source: string }
  // Renames the field at `path` to `newName` and moves its documentation, tests and flow layout with it. Fails,
  // changing nothing, when the model no longer links afterwards: the engine moves references only for callables.
  | { type: 'renamePath'; path: string; newName: string };

export type CommandResult = { ok: true } | { ok: false; error: ProjectError };

/**
 * One open project: its engine, its slice stores, and their save state. Editors get the facades (`engine`,
 * `documentation`, `tests.forSubject(…)`, `flow`) and never the repository.
 */
export interface ProjectSession {
  readonly projectId: string;
  readonly locator: ProjectLocator;
  readonly activeModel: string; // the manifest `model.source` the engine holds
  readonly engine: ProjectEngine;
  readonly documentation: DocumentationStore;
  readonly tests: ProjectTestsStore;
  readonly flow: FlowMetadataStore;

  getSnapshot(): ProjectSessionSnapshot;
  getSlice<K extends ProjectSlice>(slice: K): ProjectSliceSnapshots[K];
  // Notified once per change outside a transaction, and once per transaction.
  subscribe(listener: () => void): Unsubscribe;

  execute(command: ProjectCommand): CommandResult;
  // Runs `work` with every notification deferred to its end. If `work` throws, the engine and every slice return
  // to their state before it, and the error is returned. A nested call joins the outer transaction.
  transaction(work: () => void): CommandResult;

  getDslDraft(): string; // the uncommitted DSL text, or the committed model
  setDslDraft(text: string): void; // keeps text in memory only; `commitDsl` validates it

  // The whole project as one bundle. Throws while the DSL is invalid or a transaction is open.
  exportBundle(): ProjectBundle;
  // Saves the bundle against the revision it was loaded from. On `conflict` the phase becomes 'conflict'.
  save(): Promise<SaveResult>;
  // Frees the engine and drops every subscriber. Called by `ProjectSessionManager.close`.
  dispose(): void;
}
