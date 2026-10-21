import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {
    createLocalProjectRepository,
    createProjectFactory,
    createProjectSessionManager,
    type ProjectBundleInput,
    type ProjectSession,
} from '../../src/components/project-session';

// Every story's project lives in this IndexedDB database, under its own fresh path.
export const STORY_PROJECTS_DB = 'edgerules-storybook-projects';

const repository = createLocalProjectRepository({dbName: STORY_PROJECTS_DB});
const manager = createProjectSessionManager({engine: MutableDecisionService, repository});
const factory = createProjectFactory({engine: MutableDecisionService});

/**
 * Opens a story's project the way a host does: `ProjectFactory` builds the bundle, `LocalProjectRepository`
 * stores it, `ProjectSessionManager` opens it. Each call creates a new project, so a story always starts from its
 * fixture and stories rendered side by side (the Docs page) never share one. Use it in a story's `loaders`.
 */
export async function openStoryProject(input: ProjectBundleInput | string): Promise<ProjectSession> {
    await init();
    const bundleInput = typeof input === 'string' ? {name: 'Story model', model: {dsl: input}} : input;
    const bundle = factory.createBundle(bundleInput);
    const created = await repository.create(repository.locatorFor(`story-${bundle.manifest.projectId}`), bundle);
    return manager.open(created.locator);
}
