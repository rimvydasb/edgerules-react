export type Unsubscribe = () => void;

export interface DocumentationServiceOptions {
  // IndexedDB database name. Defaults to 'edgerules-documentation'. Override so two independently embedded
  // instances of this library in the same browser origin (e.g. two unrelated host apps) don't share one database.
  dbName?: string;

  // Called when a background IndexedDB operation fails: a write (quota exceeded, IndexedDB disabled in private
  // browsing, etc) or the initial hydration read. The in-memory state is unaffected either way — see Error
  // handling. `path` is omitted for a `'hydrate'` failure, since it affects the whole model, not one path. Omit
  // this callback to ignore persistence failures silently.
  onPersistError?: (
    error: unknown,
    context: { op: 'hydrate' | 'setDescription' | 'renamePath'; path?: string },
  ) => void;
}

export interface DocumentationService {
  // Description for a path, or undefined when none is set (including: not yet hydrated from IndexedDB).
  getDescription(path: string): string | undefined;

  // Persist an edited description; empty string clears it. Updates the in-memory value and notifies subscribers
  // synchronously; the IndexedDB write happens in the background (see Error handling).
  setDescription(path: string, description: string): void;

  // Migrate a description entry when a node's path changes (called by a host's command layer after a successful
  // rename/move on whichever CRUD-addressable service owns that path). No-op if `from` has no description.
  renamePath(from: string, to: string): void;

  // Notifies after any of the above changes the in-memory state, and once after initial IndexedDB hydration
  // completes. Lets useSyncExternalStore-based consumers (see useDescription) stay in sync across every mounted
  // component reading this same service instance.
  subscribe(listener: () => void): Unsubscribe;

  // Closes the underlying IndexedDB connection and drops all listeners. Call on teardown (tests, or a host
  // unmounting every editor for a model). If hydration is still in flight when this is called, its result is
  // discarded on arrival — it does not touch the cache or notify listeners after disposal.
  dispose(): void;
}
