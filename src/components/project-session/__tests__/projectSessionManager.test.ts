import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createProjectFactory } from '../factory/createProjectFactory';
import { createLocalProjectRepository } from '../repository/createLocalProjectRepository';
import { createProjectSessionManager } from '../session/createProjectSessionManager';
import { LOAN_MODEL, nodeEngine, uniqueDbName } from '../testing/sessionFixture';

async function setup() {
  const repository = createLocalProjectRepository({ dbName: uniqueDbName() });
  const factory = createProjectFactory({ engine: nodeEngine });
  const manager = createProjectSessionManager({ engine: nodeEngine, repository });
  const create = async (projectPath: string, dsl: string) =>
    (await repository.create(repository.locatorFor(projectPath), factory.createBundle({ name: projectPath, model: { dsl } })))
      .locator;
  return { repository, manager, create };
}

describe('ProjectSessionManager', () => {
  it('uses the injected repository', async () => {
    const { repository, manager } = await setup();
    expect(manager.repository).toBe(repository);
  });

  it('defaults to the local IndexedDB repository', () => {
    const manager = createProjectSessionManager({ engine: nodeEngine });
    expect(manager.repository).toMatchObject({ resource: 'edgerules-projects' });
  });

  it('keeps open projects isolated from each other', async () => {
    const { manager, create } = await setup();
    const first = await manager.open(await create('first', '{ value: 1 }'));
    const second = await manager.open(await create('second', '{ value: 1 }'));

    first.engine.set('value', { '@kind': 'expression', expression: '10' });
    first.documentation.setDescription('value', 'First only');
    first.tests.forSubject('*').addTestCase('First case');

    expect(await first.engine.execute('*')).toEqual({ value: 10 });
    expect(await second.engine.execute('*')).toEqual({ value: 1 });
    expect(second.documentation.getDescription('value')).toBeUndefined();
    expect(second.tests.forSubject('*').listTestCases()).toEqual([]);
    expect(second.getSnapshot().dirtySlices).toEqual([]);
    expect(manager.listOpen()).toEqual([first, second]);
    expect(manager.get(first.projectId)).toBe(first);
  });

  it('returns the open session for a locator instead of loading it twice', async () => {
    const { manager, create } = await setup();
    const locator = await create('loans', LOAN_MODEL);
    const [a, b] = await Promise.all([manager.open(locator), manager.open(locator)]);
    expect(a).toBe(b);
    expect(await manager.open({ ...locator })).toBe(a);
    expect(manager.listOpen()).toHaveLength(1);
  });

  it('closes a session and can open it again from the repository', async () => {
    const { manager, create } = await setup();
    const locator = await create('loans', LOAN_MODEL);
    const session = await manager.open(locator);
    session.documentation.setDescription('decision', 'unsaved');

    await manager.close(session.projectId);

    expect(session.getSnapshot().phase).toBe('closed');
    expect(manager.get(session.projectId)).toBeUndefined();
    const reopened = await manager.open(locator);
    expect(reopened).not.toBe(session);
    expect(reopened.documentation.getDescription('decision')).toBeUndefined();
  });

  it('reopens what a session saved', async () => {
    const { manager, create } = await setup();
    const locator = await create('loans', LOAN_MODEL);
    const session = await manager.open(locator);
    session.execute({ type: 'renamePath', path: 'risk', newName: 'score' });
    session.documentation.setDescription('score', 'Saved');
    await session.save();
    await manager.close(session.projectId);

    const reopened = await manager.open(locator);
    expect(reopened.getSnapshot().revision).toBe('2');
    expect(reopened.engine.exportDsl()).toContain('decision: score(applicant.age)');
    expect(reopened.documentation.getDescription('score')).toBe('Saved');
  });

  it('fails to open a missing project or a stored model that does not link', async () => {
    const { repository, manager, create } = await setup();
    await expect(manager.open(repository.locatorFor('missing'))).rejects.toMatchObject({ code: 'not-found' });

    const locator = await create('broken', '{ a: 1 }');
    const stored = await repository.load(locator);
    await repository.save(locator, { ...stored.bundle, model: '{ a: missing }' }, stored.revision);
    await expect(manager.open(locator)).rejects.toMatchObject({ code: 'invalid-model' });
    expect(manager.listOpen()).toEqual([]);
  });
});
