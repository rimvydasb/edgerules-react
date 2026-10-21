import { locatorKey, type ProjectLocator } from '../bundle/types';
import type { ProjectEngineClass } from '../engine/types';
import { ProjectError } from '../errors';
import { createLocalProjectRepository } from '../repository/createLocalProjectRepository';
import type { ProjectRepository } from '../repository/types';
import { createProjectSession } from './createProjectSession';
import type { ProjectSession } from './types';

export interface ProjectSessionManagerOptions {
  engine: ProjectEngineClass;
  repository?: ProjectRepository; // defaults to `createLocalProjectRepository()`
}

// Opens projects into sessions, one per project, and closes them.
export interface ProjectSessionManager {
  readonly repository: ProjectRepository;
  // Loads the project at `locator` into a new session, or returns the session already open for it.
  open(locator: ProjectLocator, revision?: string): Promise<ProjectSession>;
  get(projectId: string): ProjectSession | undefined;
  listOpen(): ProjectSession[];
  // Disposes the session's engine and subscriptions. Unsaved changes are dropped.
  close(projectId: string): Promise<void>;
}

export function createProjectSessionManager(options: ProjectSessionManagerOptions): ProjectSessionManager {
  const repository = options.repository ?? createLocalProjectRepository();
  const sessions = new Map<string, ProjectSession>(); // by projectId
  const opening = new Map<string, Promise<ProjectSession>>(); // by locator

  function openAt(locator: ProjectLocator): ProjectSession | undefined {
    const key = locatorKey(locator);
    return [...sessions.values()].find((session) => locatorKey(session.locator) === key);
  }

  async function load(locator: ProjectLocator, revision: string | undefined): Promise<ProjectSession> {
    const loaded = await repository.load(locator, revision);
    const { projectId } = loaded.bundle.manifest;
    if (sessions.has(projectId)) {
      throw new ProjectError('already-exists', `Project ${projectId} is already open from another location`);
    }
    const session = createProjectSession({ loaded, repository, engine: options.engine });
    sessions.set(projectId, session);
    return session;
  }

  return {
    repository,

    open(locator, revision) {
      const existing = openAt(locator);
      if (existing) return Promise.resolve(existing);
      const key = locatorKey(locator);
      let pending = opening.get(key);
      if (!pending) {
        pending = load(locator, revision).finally(() => opening.delete(key));
        opening.set(key, pending);
      }
      return pending;
    },

    get: (projectId) => sessions.get(projectId),

    listOpen: () => [...sessions.values()],

    async close(projectId) {
      const session = sessions.get(projectId);
      if (!session) return;
      sessions.delete(projectId);
      session.dispose();
    },
  };
}
