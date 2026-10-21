import {describe, expect, it} from 'vitest';
import {PROJECT_FORMAT_VERSION, type ProjectBundle, type ProjectLocator} from '../bundle/types';
import type {ProjectRepository} from '../repository/types';

export interface RepositoryContractSetup {
    repository: ProjectRepository;
    newLocator(): ProjectLocator; // an unused target, different on every call
}

// A valid bundle with a fresh projectId. Repositories do not run the engine, so the model need not link.
export function contractBundle(name = 'Contract project'): ProjectBundle {
    return {
        manifest: {
            kind: 'EdgeRulesProject',
            formatVersion: PROJECT_FORMAT_VERSION,
            projectId: crypto.randomUUID(),
            name,
            tags: ['contract'],
            model: {format: 'dsl', source: 'model/main.edge'},
        },
        model: '{ a: 1; b: a + 1 }',
        documentation: {schemaVersion: 1, byPath: {a: 'The first value'}},
        tests: {
            schemaVersion: 1,
            subjects: {
                '*': {
                    cases: [{id: 'case-1', name: 'Case 1', order: 0, inputs: {a: '2'}, assertions: {}}],
                    rows: [{path: 'a', section: 'inputs', order: 0, type: 'number', present: true}],
                },
            },
        },
        flow: {schemaVersion: 1, layout: {positions: {b: {x: 10, y: 20}}, outputs: []}},
    };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('expected the promise to reject');
}

/**
 * The behaviour every `ProjectRepository` adapter shares. Call it from the adapter's own test file; `setup` runs
 * before every test.
 */
export function describeProjectRepositoryContract(
    name: string,
    setup: () => RepositoryContractSetup | Promise<RepositoryContractSetup>,
): void {
    describe(`${name} — ProjectRepository contract`, () => {
        it('loads exactly what it created, at the revision create returned', async () => {
            const {repository, newLocator} = await setup();
            const locator = newLocator();
            const bundle = contractBundle();
            const created = await repository.create(locator, bundle);
            expect(created.bundle).toEqual(bundle);
            expect(created.locator).toEqual(locator);

            const loaded = await repository.load(locator);
            expect(loaded).toEqual({locator, revision: created.revision, bundle});
            expect(await repository.load(locator, created.revision)).toEqual(loaded);
        });

        it('returns bundles that share nothing with the caller', async () => {
            const {repository, newLocator} = await setup();
            const locator = newLocator();
            const bundle = contractBundle();
            const original = structuredClone(bundle);
            await repository.create(locator, bundle);
            bundle.documentation.byPath.a = 'changed by the caller';
            const loaded = await repository.load(locator);
            loaded.bundle.tests.subjects['*'].cases[0].name = 'changed after loading';
            expect((await repository.load(locator)).bundle).toEqual(original);
        });

        it('refuses to create over an existing project', async () => {
            const {repository, newLocator} = await setup();
            const locator = newLocator();
            await repository.create(locator, contractBundle());
            expect(await rejection(repository.create(locator, contractBundle()))).toMatchObject({
                code: 'already-exists',
            });
        });

        it('refuses a second project with the same projectId', async () => {
            const {repository, newLocator} = await setup();
            const bundle = contractBundle();
            await repository.create(newLocator(), bundle);
            expect(await rejection(repository.create(newLocator(), bundle))).toMatchObject({code: 'already-exists'});
        });

        it('rejects an invalid bundle without storing it', async () => {
            const {repository, newLocator} = await setup();
            const locator = newLocator();
            const bundle = {...contractBundle(), documentation: {schemaVersion: 1, byPath: {a: 1}}};
            expect(await rejection(repository.create(locator, bundle as never))).toMatchObject({
                code: 'invalid-bundle',
            });
            expect(await rejection(repository.load(locator))).toMatchObject({code: 'not-found'});
        });

        it('reports a missing project as not-found', async () => {
            const {repository, newLocator} = await setup();
            const locator = newLocator();
            expect(await rejection(repository.load(locator))).toMatchObject({code: 'not-found'});
            expect(await rejection(repository.save(locator, contractBundle(), '1'))).toMatchObject({code: 'not-found'});
        });

        it('saves against the expected revision and returns a new head', async () => {
            const {repository, newLocator} = await setup();
            const locator = newLocator();
            const bundle = contractBundle();
            const created = await repository.create(locator, bundle);
            const edited: ProjectBundle = {...bundle, model: '{ a: 5; b: a + 1 }'};

            const saved = await repository.save(locator, edited, created.revision);
            expect(saved.revision).not.toBe(created.revision);
            expect(saved.descriptor).toMatchObject({
                projectId: bundle.manifest.projectId,
                name: bundle.manifest.name,
                tags: ['contract'],
                locator,
                headRevision: saved.revision,
            });
            expect(await repository.load(locator)).toEqual({locator, revision: saved.revision, bundle: edited});
        });

        it('rejects a save against a stale revision and keeps the stored head', async () => {
            const {repository, newLocator} = await setup();
            const locator = newLocator();
            const bundle = contractBundle();
            const created = await repository.create(locator, bundle);
            const first = await repository.save(locator, {...bundle, model: '{ a: 2 }'}, created.revision);

            const stale = await rejection(repository.save(locator, {...bundle, model: '{ a: 3 }'}, created.revision));
            expect(stale).toMatchObject({code: 'conflict'});
            expect(await repository.load(locator)).toMatchObject({
                revision: first.revision,
                bundle: {model: '{ a: 2 }'},
            });
        });

        it('lets exactly one of two concurrent saves from the same revision win', async () => {
            const {repository, newLocator} = await setup();
            const locator = newLocator();
            const bundle = contractBundle();
            const created = await repository.create(locator, bundle);

            const outcomes = await Promise.allSettled([
                repository.save(locator, {...bundle, model: '{ a: 10 }'}, created.revision),
                repository.save(locator, {...bundle, model: '{ a: 20 }'}, created.revision),
            ]);
            expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
            const failed = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
            expect(failed.reason).toMatchObject({code: 'conflict'});
        });

        it('refuses a save that changes the projectId', async () => {
            const {repository, newLocator} = await setup();
            const locator = newLocator();
            const created = await repository.create(locator, contractBundle());
            const other = contractBundle();
            expect(await rejection(repository.save(locator, other, created.revision))).toMatchObject({
                code: 'invalid-bundle',
            });
        });
    });
}
