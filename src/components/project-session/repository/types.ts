import type { LoadedProject, ProjectBundle, ProjectDescriptor, ProjectLocator, SaveResult } from '../bundle/types';

/**
 * Loads and conditionally saves whole project bundles. Only `ProjectSession` writes through it. Failures are
 * `ProjectError`s: `not-found`, `already-exists`, `conflict`, `invalid-locator`, `invalid-bundle`.
 */
export interface ProjectRepository {
  // `revision` defaults to the head; a repository that keeps no history rejects any other with `not-found`.
  load(locator: ProjectLocator, revision?: string): Promise<LoadedProject>;
  // Stores a new project at `target`; `already-exists` when the path or the manifest `projectId` is taken.
  create(target: ProjectLocator, bundle: ProjectBundle): Promise<LoadedProject>;
  // Compare-and-swap: writes only while the head is still `expectedRevision`, otherwise `conflict`.
  save(locator: ProjectLocator, bundle: ProjectBundle, expectedRevision: string): Promise<SaveResult>;
}

// A device-local repository (`provider: 'indexeddb'`), the canonical store of the projects it holds.
export interface LocalProjectRepository extends ProjectRepository {
  readonly resource: string; // the IndexedDB database name
  locatorFor(projectPath: string): ProjectLocator;
  list(): Promise<ProjectDescriptor[]>; // ordered by name, then path
  // The first project, by path, whose manifest `name` is `name`. Names are not unique; locators are.
  findByName(name: string): Promise<ProjectLocator | undefined>;
}
