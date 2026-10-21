import { MutableDecisionService } from '@edgerules/node/mutable';
import type { ProjectEngineClass } from '../engine/types';
import { createProjectFactory, type ProjectBundleInput } from '../factory/createProjectFactory';
import { createLocalProjectRepository } from '../repository/createLocalProjectRepository';
import { createProjectSessionManager } from '../session/createProjectSessionManager';
import type { ProjectSession } from '../session/types';

// The real engine; tests never mock it. Needs `fake-indexeddb/auto` imported by the test file.
export const nodeEngine: ProjectEngineClass = MutableDecisionService;

export const LOAN_MODEL = `{
    func risk(age: number): { level: if age < 25 then "high" else "low" }
    applicant: { age: 30, income: 5000 }
    decision: risk(applicant.age)
    unused: 1
}`;

export function uniqueDbName(): string {
  return `projects-${Math.random().toString(36).slice(2)}`;
}

// Creates a project in a fresh local repository and opens it, the way a host does.
export async function openFixtureProject(input: Partial<ProjectBundleInput> = {}) {
  const repository = createLocalProjectRepository({ dbName: uniqueDbName() });
  const manager = createProjectSessionManager({ engine: nodeEngine, repository });
  const bundle = createProjectFactory({ engine: nodeEngine }).createBundle({
    name: 'Loans',
    model: { dsl: LOAN_MODEL },
    ...input,
  });
  const created = await repository.create(repository.locatorFor('loans'), bundle);
  const session: ProjectSession = await manager.open(created.locator);
  return { repository, manager, session, bundle, locator: created.locator };
}
