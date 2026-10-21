import { createChangeBatch, type ListenerSet } from '../../../lib/changeBatch';
import { parseProjectBundle } from '../bundle/parseProjectBundle';
import type { LoadedProject, ProjectBundle, ProjectLocator } from '../bundle/types';
import { createProjectEngine } from '../engine/createProjectEngine';
import type { ProjectEngineClass } from '../engine/types';
import { ProjectError, isProjectError, messageOf } from '../errors';
import type { ProjectRepository } from '../repository/types';
import { createDocumentationStore } from '../stores/createDocumentationStore';
import { createFlowMetadataStore } from '../stores/createFlowMetadataStore';
import { createProjectTestsStore } from '../stores/createProjectTestsStore';
import type { StoreContext } from '../stores/storeSupport';
import type {
  CommandResult,
  DslValidity,
  ModelSnapshot,
  ProjectCommand,
  ProjectSession,
  ProjectSessionPhase,
  ProjectSessionSnapshot,
  ProjectSlice,
  ProjectSliceSnapshots,
} from './types';

export interface ProjectSessionOptions {
  loaded: LoadedProject;
  repository: ProjectRepository;
  engine: ProjectEngineClass;
}

const SLICE_ORDER: readonly ProjectSlice[] = ['model', 'documentation', 'tests', 'flow'];

// Everything a failed transaction restores.
interface Checkpoint {
  dsl: string;
  documents: Pick<ProjectBundle, 'documentation' | 'tests' | 'flow'>;
  dirty: Set<ProjectSlice>;
  localVersion: number;
  modelVersion: number;
}

function parentOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(0, dot + 1);
}

function toProjectError(error: unknown): ProjectError {
  if (isProjectError(error)) return error;
  return new ProjectError('command-failed', messageOf(error), { cause: error });
}

// Engine writes report failure as a returned `PortableError`; inside a transaction it must throw to roll back.
function check(result: unknown): void {
  if (typeof result === 'object' && result !== null && (result as { '@kind'?: unknown })['@kind'] === 'error') {
    throw new ProjectError('command-failed', messageOf(result));
  }
}

/**
 * Builds the in-memory working copy of a loaded project. Throws `ProjectError('invalid-model')` when its DSL does
 * not parse or link.
 */
export function createProjectSession({ loaded, repository, engine: engineClass }: ProjectSessionOptions): ProjectSession {
  const bundle = parseProjectBundle(loaded.bundle);
  const { manifest } = bundle;
  const locator: ProjectLocator = { ...loaded.locator };

  const batch = createChangeBatch();
  const listenerSets: ListenerSet[] = [];
  function createListenerSet(): ListenerSet {
    const set = batch.createListenerSet();
    listenerSets.push(set);
    return set;
  }
  const sessionListeners = createListenerSet();

  let phase: ProjectSessionPhase = 'ready';
  let revision = loaded.revision;
  let localVersion = 0;
  let modelVersion = 0;
  const dirty = new Set<ProjectSlice>();
  let dslValidity: DslValidity = { status: 'valid' };
  let dslDraft: string | undefined;
  let restoring = false;
  let inTransaction = false;

  let snapshot: ProjectSessionSnapshot | undefined;
  let modelSnapshot: ModelSnapshot | undefined;

  function publish(): void {
    snapshot = undefined;
    sessionListeners.notify();
  }

  function sliceChanged(slice: ProjectSlice): void {
    if (restoring) return;
    dirty.add(slice);
    localVersion += 1;
    if (slice === 'model') modelVersion += 1;
    publish();
  }

  function contextFor(slice: ProjectSlice): StoreContext {
    return { listeners: createListenerSet, onChange: () => sliceChanged(slice) };
  }

  const engineHandle = createProjectEngine(engineClass, bundle.model, () => sliceChanged('model'));
  const documentation = createDocumentationStore(contextFor('documentation'));
  const tests = createProjectTestsStore(contextFor('tests'));
  const flow = createFlowMetadataStore(contextFor('flow'));

  function replaceSlices(documents: Checkpoint['documents']): void {
    restoring = true;
    try {
      documentation.replaceDocument(documents.documentation);
      tests.replaceDocument(documents.tests);
      flow.replaceDocument(documents.flow);
    } finally {
      restoring = false;
    }
  }
  replaceSlices(bundle);

  // A function, so the check is not narrowed away across an `await`.
  function isClosed(): boolean {
    return phase === 'closed';
  }

  function assertOpen(): void {
    if (isClosed()) throw new ProjectError('invalid-state', `Project '${manifest.name}' is closed`);
  }

  function checkpoint(): Checkpoint {
    return {
      dsl: engineHandle.facade.exportDsl(),
      documents: { documentation: documentation.exportDocument(), tests: tests.exportDocument(), flow: flow.exportDocument() },
      dirty: new Set(dirty),
      localVersion,
      modelVersion,
    };
  }

  function restore(saved: Checkpoint): void {
    engineHandle.load(saved.dsl, { link: false });
    replaceSlices(saved.documents);
    dirty.clear();
    for (const slice of saved.dirty) dirty.add(slice);
    localVersion = saved.localVersion;
    modelVersion = saved.modelVersion;
    publish();
  }

  function transaction(work: () => void): CommandResult {
    assertOpen();
    if (inTransaction) {
      work();
      return { ok: true };
    }
    const saved = checkpoint();
    inTransaction = true;
    try {
      return batch.run(() => {
        try {
          work();
          return { ok: true } as const;
        } catch (error) {
          restore(saved);
          return { ok: false, error: toProjectError(error) } as const;
        }
      });
    } finally {
      inTransaction = false;
    }
  }

  function commitDsl(source: string): CommandResult {
    return batch.run(() => {
      try {
        engineHandle.load(source);
      } catch (error) {
        dslDraft = source;
        dslValidity = { status: 'invalid', message: messageOf(error) };
        publish();
        return { ok: false, error: toProjectError(error) };
      }
      dslDraft = undefined;
      dslValidity = { status: 'valid' };
      sliceChanged('model');
      return { ok: true };
    });
  }

  function renamePath(path: string, newName: string): CommandResult {
    const to = parentOf(path) + newName;
    return transaction(() => {
      check(engineHandle.facade.rename(path, newName));
      engineHandle.facade.link();
      documentation.renamePath(path, to);
      tests.renamePath(path, to);
      flow.renamePath(path, to);
    });
  }

  const sliceReaders: { [K in ProjectSlice]: () => ProjectSliceSnapshots[K] } = {
    model() {
      // A closed session's engine is freed; its last snapshot stays readable.
      if (modelSnapshot && (isClosed() || modelSnapshot.version === modelVersion)) return modelSnapshot;
      modelSnapshot = Object.freeze({ version: modelVersion, dsl: engineHandle.facade.exportDsl() });
      return modelSnapshot;
    },
    documentation: () => documentation.exportDocument(),
    tests: () => tests.exportDocument(),
    flow: () => flow.exportDocument(),
  };

  const session: ProjectSession = {
    projectId: manifest.projectId,
    locator,
    activeModel: manifest.model.source,
    engine: engineHandle.facade,
    documentation,
    tests,
    flow,

    getSnapshot() {
      snapshot ??= Object.freeze({
        phase,
        projectId: manifest.projectId,
        name: manifest.name,
        locator,
        revision,
        localVersion,
        dirtySlices: Object.freeze(SLICE_ORDER.filter((slice) => dirty.has(slice))),
        dslValidity,
        hasDslDraft: dslDraft !== undefined,
      });
      return snapshot;
    },

    getSlice: (slice) => sliceReaders[slice](),

    subscribe: sessionListeners.subscribe,

    execute(command: ProjectCommand): CommandResult {
      assertOpen();
      switch (command.type) {
        case 'commitDsl':
          return commitDsl(command.source);
        case 'renamePath':
          return renamePath(command.path, command.newName);
      }
    },

    transaction,

    getDslDraft: () => dslDraft ?? engineHandle.facade.exportDsl(),

    setDslDraft(text) {
      assertOpen();
      dslDraft = text;
      publish();
    },

    exportBundle(): ProjectBundle {
      assertOpen();
      if (inTransaction) throw new ProjectError('invalid-state', 'Cannot export while a transaction is open');
      if (dslValidity.status === 'invalid') {
        throw new ProjectError('invalid-state', `The model DSL is invalid: ${dslValidity.message}`);
      }
      return structuredClone({
        manifest,
        model: engineHandle.facade.exportDsl(),
        documentation: documentation.exportDocument(),
        tests: tests.exportDocument(),
        flow: flow.exportDocument(),
      });
    },

    async save() {
      assertOpen();
      if (phase === 'saving') throw new ProjectError('invalid-state', 'A save is already in progress');
      const exported = session.exportBundle();
      const savedVersion = localVersion;
      phase = 'saving';
      publish();
      try {
        const result = await repository.save(locator, exported, revision);
        if (isClosed()) return result;
        revision = result.revision;
        // Changes made while the save was in flight are not in the saved revision and stay dirty.
        if (localVersion === savedVersion) dirty.clear();
        phase = 'ready';
        publish();
        return result;
      } catch (error) {
        if (!isClosed()) {
          phase = isProjectError(error, 'conflict') ? 'conflict' : 'ready';
          publish();
        }
        throw error;
      }
    },

    dispose() {
      if (isClosed()) return;
      phase = 'closed';
      publish();
      engineHandle.dispose();
      for (const set of listenerSets) set.clear();
    },
  };

  return session;
}
