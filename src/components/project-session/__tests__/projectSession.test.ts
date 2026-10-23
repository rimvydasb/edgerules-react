import 'fake-indexeddb/auto';
import {describe, expect, it, vi} from 'vitest';
import type {TestSuitesDocument} from '../bundle/types';
import {openFixtureProject} from '../testing/sessionFixture';

const RISK_TESTS: TestSuitesDocument = {
    schemaVersion: 1,
    subjects: {
        risk: {
            cases: [{id: 'young', name: 'Young', order: 0, inputs: {age: '20'}, assertions: {level: '"high"'}}],
            rows: [
                {path: 'age', section: 'inputs', order: 0, type: 'number', present: true},
                {path: 'level', section: 'assertions', order: 0, type: 'string', present: true},
            ],
        },
        '*': {
            cases: [{id: 'model', name: 'Model', order: 0, inputs: {'applicant.age': '40'}, assertions: {}}],
            rows: [{path: 'applicant.age', section: 'inputs', order: 0, type: 'number', present: true}],
        },
    },
};

describe('ProjectSession — open', () => {
    it('loads every slice of the bundle into a clean session', async () => {
        const {session, bundle, locator} = await openFixtureProject({
            documentation: {schemaVersion: 1, byPath: {decision: 'Final decision'}},
            tests: RISK_TESTS,
            flow: {schemaVersion: 2, layouts: {'*': {positions: {decision: {x: 1, y: 2}}, outputs: []}}},
        });

        expect(session.projectId).toBe(bundle.manifest.projectId);
        expect(session.locator).toEqual(locator);
        expect(session.activeModel).toBe('model/main.edge');
        expect(session.getSnapshot()).toEqual({
            phase: 'ready',
            projectId: bundle.manifest.projectId,
            name: 'Loans',
            locator,
            revision: '1',
            localVersion: 0,
            dirtySlices: [],
            dslValidity: {status: 'valid'},
            hasDslDraft: false,
        });
        expect(await session.engine.execute('*')).toMatchObject({decision: {level: 'low'}});
        expect(session.documentation.getDescription('decision')).toBe('Final decision');
        expect(
            session.tests
                .forSubject('risk')
                .listTestCases()
                .map((c) => c.name),
        ).toEqual(['Young']);
        expect(session.flow.getLayout('*').positions).toEqual({decision: {x: 1, y: 2}});
        expect(session.getSlice('tests')).toEqual(RISK_TESTS);
    });
});

describe('ProjectSession — changes and notifications', () => {
    it('marks the model dirty on every engine write through the facade', async () => {
        const {session} = await openFixtureProject();
        const listener = vi.fn();
        session.subscribe(listener);
        const before = session.getSlice('model');

        session.engine.set('unused', {'@kind': 'expression', expression: '2'});

        expect(listener).toHaveBeenCalledTimes(1);
        expect(session.getSnapshot()).toMatchObject({dirtySlices: ['model'], localVersion: 1});
        const after = session.getSlice('model');
        expect(after.version).toBe(before.version + 1);
        expect(after.dsl).toContain('unused: 2');
        expect(session.engine.exportDsl()).toBe(after.dsl);
    });

    it('keeps snapshots referentially stable until their slice changes', async () => {
        const {session} = await openFixtureProject();
        const snapshot = session.getSnapshot();
        const model = session.getSlice('model');
        const documentation = session.getSlice('documentation');
        expect(session.getSnapshot()).toBe(snapshot);
        expect(session.getSlice('model')).toBe(model);

        session.documentation.setDescription('decision', 'Why');

        expect(session.getSnapshot()).not.toBe(snapshot);
        expect(session.getSlice('model')).toBe(model);
        expect(session.getSlice('documentation')).not.toBe(documentation);
        expect(session.getSlice('documentation').byPath).toEqual({decision: 'Why'});
        expect(session.getSnapshot().dirtySlices).toEqual(['documentation']);
    });

    it('does not count a no-op write as a change', async () => {
        const {session} = await openFixtureProject({
            documentation: {schemaVersion: 1, byPath: {decision: 'Why'}},
        });
        session.documentation.setDescription('decision', 'Why');
        session.flow.setLayout('*', {positions: {}, outputs: []});
        const service = session.tests.forSubject('*');
        service.syncRows([]);
        expect(session.getSnapshot().dirtySlices).toEqual([]);
    });

    it('tracks tests per subject and never exports results', async () => {
        const {session} = await openFixtureProject({tests: RISK_TESTS});
        const service = session.tests.forSubject('risk');
        expect(session.tests.forSubject('risk')).toBe(service);

        service.saveResultSet({testCaseId: 'young', ranAt: 1, status: 'ok', results: {}});
        expect(session.getSnapshot().dirtySlices).toEqual([]);
        expect(service.getResultSet('young')).toBeDefined();

        service.renameTestCase('young', 'Under 25');
        service.dispose(); // a component unmounting changes nothing: the session owns the data
        expect(session.getSnapshot().dirtySlices).toEqual(['tests']);
        expect(session.getSlice('tests').subjects.risk.cases[0].name).toBe('Under 25');
        expect(JSON.stringify(session.exportBundle().tests)).not.toContain('ranAt');
    });

    it('publishes one notification per transaction', async () => {
        const {session} = await openFixtureProject();
        const sessionListener = vi.fn();
        const documentationListener = vi.fn();
        session.subscribe(sessionListener);
        session.documentation.subscribe(documentationListener);

        const result = session.transaction(() => {
            session.engine.set('unused', {'@kind': 'expression', expression: '3'});
            session.documentation.setDescription('unused', 'One');
            session.documentation.setDescription('decision', 'Two');
            session.flow.setLayout('*', {positions: {decision: {x: 5, y: 5}}, outputs: []});
            expect(sessionListener).not.toHaveBeenCalled();
        });

        expect(result).toEqual({ok: true});
        expect(sessionListener).toHaveBeenCalledTimes(1);
        expect(documentationListener).toHaveBeenCalledTimes(1);
        expect(session.getSnapshot().dirtySlices).toEqual(['model', 'documentation', 'flow']);
    });

    it('rolls every slice back when a transaction fails', async () => {
        const {session} = await openFixtureProject({tests: RISK_TESTS});
        const before = {
            snapshot: session.getSnapshot(),
            dsl: session.engine.exportDsl(),
            documentation: session.getSlice('documentation'),
            tests: session.getSlice('tests'),
            flow: session.getSlice('flow'),
        };
        const seen: string[] = [];
        session.subscribe(() => seen.push(session.engine.exportDsl()));

        const result = session.transaction(() => {
            session.engine.set('unused', {'@kind': 'expression', expression: '99'});
            session.documentation.setDescription('unused', 'Lost');
            session.tests.forSubject('risk').addTestCase('Lost');
            session.flow.setLayout('*', {positions: {unused: {x: 0, y: 0}}, outputs: []});
            throw new Error('boom');
        });

        expect(result).toMatchObject({ok: false, error: {code: 'command-failed', message: 'boom'}});
        expect(session.engine.exportDsl()).toBe(before.dsl);
        expect(session.getSlice('documentation')).toEqual(before.documentation);
        expect(session.getSlice('tests')).toEqual(before.tests);
        expect(session.getSlice('flow')).toEqual(before.flow);
        expect(session.getSnapshot()).toEqual(before.snapshot);
        expect(
            session.tests
                .forSubject('risk')
                .listTestCases()
                .map((c) => c.name),
        ).toEqual(['Young']);
        // Subscribers never observe the partial state.
        expect(seen.every((dsl) => dsl === before.dsl)).toBe(true);
        expect(await session.engine.execute('*')).toMatchObject({unused: 1});
    });
});

describe('ProjectSession — commands', () => {
    it('renames a callable across the model, documentation, tests and flow layout', async () => {
        const {session} = await openFixtureProject({
            documentation: {schemaVersion: 1, byPath: {risk: 'Risk rule', 'risk.level': 'Band'}},
            tests: RISK_TESTS,
            flow: {
                schemaVersion: 2,
                layouts: {
                    '*': {
                        positions: {risk: {x: 1, y: 1}},
                        outputs: [{id: 'output', source: {node: 'risk', handle: 'level'}}],
                    },
                },
            },
        });
        const listener = vi.fn();
        session.subscribe(listener);

        expect(session.execute({type: 'renamePath', path: 'risk', newName: 'score'})).toEqual({ok: true});

        expect(listener).toHaveBeenCalledTimes(1);
        expect(session.engine.exportDsl()).toContain('decision: score(applicant.age)');
        expect(session.getSlice('documentation').byPath).toEqual({score: 'Risk rule', 'score.level': 'Band'});
        expect(Object.keys(session.getSlice('tests').subjects).sort()).toEqual(['*', 'score']);
        expect(
            session.tests
                .forSubject('score')
                .listTestCases()
                .map((c) => c.name),
        ).toEqual(['Young']);
        expect(session.getSlice('flow').layouts['*']).toEqual({
            positions: {score: {x: 1, y: 1}},
            outputs: [{id: 'output', source: {node: 'score', handle: 'level'}}],
        });
        expect(session.getSnapshot().dirtySlices).toEqual(['model', 'documentation', 'tests', 'flow']);
    });

    it('renames a nested field and rewrites model-wide test paths', async () => {
        const {session} = await openFixtureProject({
            documentation: {schemaVersion: 1, byPath: {'applicant.income': 'Monthly'}},
            tests: RISK_TESTS,
        });
        expect(session.execute({type: 'renamePath', path: 'applicant.income', newName: 'salary'})).toEqual({ok: true});
        expect(session.engine.exportDsl()).toContain('salary: 5000');
        expect(session.documentation.getDescription('applicant.salary')).toBe('Monthly');
    });

    it('refuses a rename that leaves references dangling and changes nothing', async () => {
        const {session} = await openFixtureProject({tests: RISK_TESTS});
        const dsl = session.engine.exportDsl();

        const result = session.execute({type: 'renamePath', path: 'applicant', newName: 'person'});

        expect(result).toMatchObject({ok: false, error: {code: 'command-failed'}});
        expect(result.ok || result.error.message).toContain("unresolved reference 'applicant.age'");
        expect(session.engine.exportDsl()).toBe(dsl);
        expect(session.getSlice('tests')).toEqual(RISK_TESTS);
        expect(session.getSnapshot().dirtySlices).toEqual([]);
    });

    it('commits valid DSL and keeps an invalid draft without touching the model', async () => {
        const {session} = await openFixtureProject();
        const facade = session.engine;

        expect(session.execute({type: 'commitDsl', source: '{ a: 1; b: a + 1 }'})).toEqual({ok: true});
        expect(session.engine).toBe(facade);
        expect(await facade.execute('*')).toEqual({a: 1, b: 2});
        expect(session.getSnapshot()).toMatchObject({dirtySlices: ['model'], dslValidity: {status: 'valid'}});

        const failed = session.execute({type: 'commitDsl', source: '{ a: 1; b: missing + 1 }'});
        expect(failed).toMatchObject({ok: false, error: {code: 'invalid-model'}});
        expect(session.getSnapshot()).toMatchObject({
            hasDslDraft: true,
            dslValidity: {status: 'invalid', message: expect.stringContaining("unresolved reference 'missing'")},
        });
        expect(session.getDslDraft()).toBe('{ a: 1; b: missing + 1 }');
        expect(await facade.execute('*')).toEqual({a: 1, b: 2});
        expect(() => session.exportBundle()).toThrow(expect.objectContaining({code: 'invalid-state'}));
        await expect(session.save()).rejects.toMatchObject({code: 'invalid-state'});

        expect(session.execute({type: 'commitDsl', source: '{ a: 5 }'})).toEqual({ok: true});
        expect(session.getSnapshot()).toMatchObject({hasDslDraft: false, dslValidity: {status: 'valid'}});
        expect(session.getDslDraft()).toBe('{\n    a: 5\n}');
    });

    it('keeps a registered solver across a DSL commit', async () => {
        const {session} = await openFixtureProject();
        const solver = () => ({status: 'optimal', objective: 0, values: {}}) as never;
        session.engine.registerSolver(solver);
        session.execute({type: 'commitDsl', source: '{ a: 1 }'});
        expect(session.engine.solverHandler).toBe(solver);
    });

    it('keeps a DSL draft in memory only', async () => {
        const {session} = await openFixtureProject();
        const dsl = session.engine.exportDsl();
        session.setDslDraft('{ a: ');
        expect(session.getDslDraft()).toBe('{ a: ');
        expect(session.getSnapshot()).toMatchObject({hasDslDraft: true, dirtySlices: []});
        expect(session.exportBundle().model).toBe(dsl);
    });
});

describe('ProjectSession — save', () => {
    it('saves one bundle against the loaded revision and clears dirty state', async () => {
        const {session, repository, locator} = await openFixtureProject();
        session.engine.set('unused', {'@kind': 'expression', expression: '7'});
        session.documentation.setDescription('unused', 'Seven');

        const result = await session.save();

        expect(result.revision).toBe('2');
        expect(session.getSnapshot()).toMatchObject({phase: 'ready', revision: '2', dirtySlices: []});
        const stored = await repository.load(locator);
        expect(stored.bundle.model).toBe(session.engine.exportDsl());
        expect(stored.bundle.model).toContain('unused: 7');
        expect(stored.bundle.documentation.byPath).toEqual({unused: 'Seven'});
    });

    it('reports the saving phase and keeps changes made during the save dirty', async () => {
        const {session} = await openFixtureProject();
        session.documentation.setDescription('a', 'first');
        const phases: string[] = [];
        session.subscribe(() => phases.push(session.getSnapshot().phase));

        const saving = session.save();
        session.flow.setLayout('*', {positions: {decision: {x: 3, y: 3}}, outputs: []});
        await saving;

        expect(phases[0]).toBe('saving');
        expect(session.getSnapshot()).toMatchObject({phase: 'ready', dirtySlices: ['documentation', 'flow']});
    });

    it('enters the conflict phase when the stored revision moved on', async () => {
        const {session, repository, locator} = await openFixtureProject();
        const elsewhere = await repository.load(locator);
        await repository.save(locator, {...elsewhere.bundle, model: '{ x: 1 }'}, elsewhere.revision);

        session.documentation.setDescription('a', 'mine');
        await expect(session.save()).rejects.toMatchObject({code: 'conflict'});
        expect(session.getSnapshot()).toMatchObject({phase: 'conflict', revision: '1', dirtySlices: ['documentation']});
        expect((await repository.load(locator)).bundle.model).toBe('{ x: 1 }');
    });

    it('refuses work once disposed', async () => {
        const {session} = await openFixtureProject();
        const model = session.getSlice('model');
        const listener = vi.fn();
        session.subscribe(listener);
        session.dispose();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(session.getSnapshot().phase).toBe('closed');
        expect(session.getSlice('model')).toBe(model);
        expect(() => session.execute({type: 'commitDsl', source: '{}'})).toThrow(
            expect.objectContaining({code: 'invalid-state'}),
        );
        await expect(session.save()).rejects.toMatchObject({code: 'invalid-state'});
    });
});
