import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {createLocalProjectRepository} from '../repository/createLocalProjectRepository';
import {contractBundle, describeProjectRepositoryContract} from '../testing/repositoryContract';

function uniqueDbName(): string {
    return `projects-${Math.random().toString(36).slice(2)}`;
}

describeProjectRepositoryContract('LocalProjectRepository', () => {
    const repository = createLocalProjectRepository({dbName: uniqueDbName()});
    let next = 0;
    return {repository, newLocator: () => repository.locatorFor(`project-${(next += 1)}`)};
});

describe('LocalProjectRepository', () => {
    it('builds indexeddb locators on its own database', () => {
        const repository = createLocalProjectRepository({dbName: 'my-projects'});
        expect(repository.resource).toBe('my-projects');
        expect(repository.locatorFor('loans')).toEqual({
            provider: 'indexeddb',
            resource: 'my-projects',
            projectPath: 'loans',
        });
    });

    it('rejects locators of another provider or database', async () => {
        const repository = createLocalProjectRepository({dbName: uniqueDbName()});
        await expect(
            repository.load({provider: 'github', resource: repository.resource, projectPath: 'x'}),
        ).rejects.toMatchObject({code: 'invalid-locator'});
        await expect(
            repository.create({provider: 'indexeddb', resource: 'elsewhere', projectPath: 'x'}, contractBundle()),
        ).rejects.toMatchObject({code: 'invalid-locator'});
    });

    it('keeps only the head revision', async () => {
        const repository = createLocalProjectRepository({dbName: uniqueDbName()});
        const locator = repository.locatorFor('p');
        const bundle = contractBundle();
        const created = await repository.create(locator, bundle);
        await repository.save(locator, bundle, created.revision);
        await expect(repository.load(locator, created.revision)).rejects.toMatchObject({code: 'not-found'});
    });

    it('lists descriptors by name and finds a project by its manifest name', async () => {
        const repository = createLocalProjectRepository({dbName: uniqueDbName()});
        const pricing = contractBundle('Pricing');
        const loans = contractBundle('Loans');
        const loansCopy = contractBundle('Loans');
        await repository.create(repository.locatorFor('b-pricing'), pricing);
        await repository.create(repository.locatorFor('c-loans'), loans);
        await repository.create(repository.locatorFor('a-loans-copy'), loansCopy);

        const listed = await repository.list();
        expect(listed.map((descriptor) => [descriptor.name, descriptor.locator.projectPath])).toEqual([
            ['Loans', 'a-loans-copy'],
            ['Loans', 'c-loans'],
            ['Pricing', 'b-pricing'],
        ]);
        expect(listed[2]).toEqual({
            projectId: pricing.manifest.projectId,
            name: 'Pricing',
            description: undefined,
            tags: ['contract'],
            locator: repository.locatorFor('b-pricing'),
            headRevision: '1',
        });

        // Names are display text and may repeat: the first project by path wins.
        expect(await repository.findByName('Loans')).toEqual(repository.locatorFor('a-loans-copy'));
        expect(await repository.findByName('Unknown')).toBeUndefined();
    });

    it('keeps projects of two databases apart', async () => {
        const first = createLocalProjectRepository({dbName: uniqueDbName()});
        const second = createLocalProjectRepository({dbName: uniqueDbName()});
        await first.create(first.locatorFor('p'), contractBundle('Only in first'));
        expect(await second.list()).toEqual([]);
        await expect(second.load(second.locatorFor('p'))).rejects.toMatchObject({code: 'not-found'});
    });
});
