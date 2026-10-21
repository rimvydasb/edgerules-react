import {parseProjectBundle, parseProjectLocator} from '../bundle/parseProjectBundle';
import {
    describeProject,
    type ProjectBundle,
    type ProjectDescriptor,
    type ProjectLocator,
    type SaveResult,
} from '../bundle/types';
import {ProjectError} from '../errors';
import type {LocalProjectRepository} from './types';

export const DEFAULT_PROJECTS_DB_NAME = 'edgerules-projects';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const PROJECT_ID_INDEX = 'projectId';

interface ProjectRecord {
    projectPath: string;
    projectId: string; // unique index: two local projects never share a session key
    revision: number; // incremented by every save
    updatedAt: string;
    bundle: ProjectBundle;
}

export interface LocalProjectRepositoryOptions {
    dbName?: string; // defaults to 'edgerules-projects'; also the `resource` of every locator
}

function openProjectsDb(dbName: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, DB_VERSION);
        request.onupgradeneeded = () => {
            const store = request.result.createObjectStore(PROJECTS_STORE, {keyPath: 'projectPath'});
            store.createIndex(PROJECT_ID_INDEX, 'projectId', {unique: true});
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Runs `work` in one IndexedDB transaction and resolves with what it reported through `done` once the
 * transaction commits. `work` must only issue requests (no awaiting), or the transaction auto-commits early.
 */
async function inTransaction<T>(
    dbName: string,
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void,
): Promise<T> {
    const db = await openProjectsDb(dbName);
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(PROJECTS_STORE, mode);
            let result: {value: T} | undefined;
            let failure: {error: unknown} | undefined;
            tx.oncomplete = () => (failure ? reject(failure.error) : resolve(result!.value));
            tx.onerror = () => reject(failure?.error ?? tx.error);
            tx.onabort = () => reject(failure?.error ?? tx.error);
            work(
                tx.objectStore(PROJECTS_STORE),
                (value) => {
                    result = {value};
                },
                (error) => {
                    failure = {error};
                    tx.abort();
                },
            );
        });
    } finally {
        db.close();
    }
}

function revisionOf(record: ProjectRecord): string {
    return String(record.revision);
}

export function createLocalProjectRepository(options: LocalProjectRepositoryOptions = {}): LocalProjectRepository {
    const dbName = options.dbName ?? DEFAULT_PROJECTS_DB_NAME;

    function pathOf(locator: ProjectLocator): string {
        const {provider, resource, projectPath} = parseProjectLocator(locator);
        if (provider !== 'indexeddb' || resource !== dbName) {
            throw new ProjectError(
                'invalid-locator',
                `Locator ${provider}:${resource} does not belong to the local repository '${dbName}'`,
            );
        }
        return projectPath;
    }

    function notFound(projectPath: string): ProjectError {
        return new ProjectError('not-found', `No local project at '${projectPath}' in '${dbName}'`);
    }

    async function readAll(): Promise<ProjectRecord[]> {
        return inTransaction<ProjectRecord[]>(dbName, 'readonly', (store, done) => {
            const request = store.getAll();
            request.onsuccess = () => done(request.result as ProjectRecord[]);
        });
    }

    const repository: LocalProjectRepository = {
        resource: dbName,

        locatorFor(projectPath: string): ProjectLocator {
            return parseProjectLocator({provider: 'indexeddb', resource: dbName, projectPath});
        },

        async load(locator, revision) {
            const projectPath = pathOf(locator);
            const record = await inTransaction<ProjectRecord | undefined>(dbName, 'readonly', (store, done) => {
                const request = store.get(projectPath);
                request.onsuccess = () => done(request.result as ProjectRecord | undefined);
            });
            if (!record) throw notFound(projectPath);
            if (revision !== undefined && revision !== revisionOf(record)) {
                throw new ProjectError(
                    'not-found',
                    `Revision ${revision} of '${projectPath}' is not kept; the local repository holds only the head`,
                );
            }
            return {
                locator: repository.locatorFor(projectPath),
                revision: revisionOf(record),
                bundle: parseProjectBundle(record.bundle),
            };
        },

        async create(target, bundle) {
            const projectPath = pathOf(target);
            const valid = parseProjectBundle(bundle);
            const record: ProjectRecord = {
                projectPath,
                projectId: valid.manifest.projectId,
                revision: 1,
                updatedAt: new Date().toISOString(),
                bundle: valid,
            };
            await inTransaction<void>(dbName, 'readwrite', (store, done, fail) => {
                const request = store.add(record);
                request.onsuccess = () => done();
                request.onerror = (event) => {
                    // A duplicate path or projectId; handled here so the abort carries our error.
                    event.preventDefault();
                    fail(
                        new ProjectError(
                            'already-exists',
                            `A local project already exists at '${projectPath}' or with projectId '${record.projectId}'`,
                            {cause: request.error},
                        ),
                    );
                };
            });
            return {locator: repository.locatorFor(projectPath), revision: revisionOf(record), bundle: valid};
        },

        async save(locator, bundle, expectedRevision) {
            const projectPath = pathOf(locator);
            const valid = parseProjectBundle(bundle);
            const saved = await inTransaction<ProjectRecord>(dbName, 'readwrite', (store, done, fail) => {
                const read = store.get(projectPath);
                read.onsuccess = () => {
                    const current = read.result as ProjectRecord | undefined;
                    if (!current) return fail(notFound(projectPath));
                    if (revisionOf(current) !== expectedRevision) {
                        return fail(
                            new ProjectError(
                                'conflict',
                                `'${projectPath}' is at revision ${revisionOf(current)}, not the expected ${expectedRevision}`,
                            ),
                        );
                    }
                    if (current.projectId !== valid.manifest.projectId) {
                        return fail(new ProjectError('invalid-bundle', 'A save cannot change the manifest projectId'));
                    }
                    const next: ProjectRecord = {
                        ...current,
                        revision: current.revision + 1,
                        updatedAt: new Date().toISOString(),
                        bundle: valid,
                    };
                    store.put(next).onsuccess = () => done(next);
                };
            });
            const revision = revisionOf(saved);
            return {
                revision,
                descriptor: describeProject(valid, repository.locatorFor(projectPath), revision),
            } satisfies SaveResult;
        },

        async list(): Promise<ProjectDescriptor[]> {
            const records = await readAll();
            return records
                .map((record) =>
                    describeProject(record.bundle, repository.locatorFor(record.projectPath), revisionOf(record)),
                )
                .sort(
                    (a, b) =>
                        a.name.localeCompare(b.name) || a.locator.projectPath.localeCompare(b.locator.projectPath),
                );
        },

        async findByName(name: string): Promise<ProjectLocator | undefined> {
            // `getAll` returns records in key (path) order.
            const record = (await readAll()).find((candidate) => candidate.bundle.manifest.name === name);
            return record ? repository.locatorFor(record.projectPath) : undefined;
        },
    };

    return repository;
}
