import type {TestSubjectId, TestSuite} from '../../test-cases-service';
import type {FlowLayout} from '#lib/flowLayout';

export const PROJECT_FORMAT_VERSION = 1;
export const PROJECT_MANIFEST_FILE = 'edgerules.project.json';
export const DEFAULT_MODEL_SOURCE = 'model/main.edge';

// 'indexeddb' is a device-local project, canonical only on this device; 'github' and 's3' adapters come later.
export type ProjectProviderKind = 'indexeddb' | 'github' | 's3';

// Where a project lives. Project identity is the locator; the manifest `name` is display text.
export interface ProjectLocator {
    provider: ProjectProviderKind;
    resource: string; // indexeddb: database name
    projectPath: string; // indexeddb: project key
}

// `edgerules.project.json`.
export interface ProjectManifest {
    kind: 'EdgeRulesProject';
    formatVersion: number; // versions the whole bundle; see `parseProjectBundle`
    projectId: string; // stable UUID; sessions are keyed by it
    name: string;
    description?: string;
    tags?: string[];
    model: {format: 'dsl'; source: string}; // one model per project
}

export interface DocumentationDocument {
    schemaVersion: 1;
    byPath: Record<string, string>; // model path -> description
}

export interface TestSuitesDocument {
    schemaVersion: 1;
    subjects: Record<TestSubjectId, TestSuite>; // authored tests only; results are never persisted
}

export interface FlowMetadataDocument {
    schemaVersion: 1;
    layout: FlowLayout; // presentation only; the model holds the semantics
}

// One durable revision: everything authored for a project, saved and loaded together.
export interface ProjectBundle {
    manifest: ProjectManifest;
    model: string; // EdgeRules DSL of `manifest.model.source`
    documentation: DocumentationDocument;
    tests: TestSuitesDocument;
    flow: FlowMetadataDocument;
}

export interface ProjectDescriptor {
    projectId: string;
    name: string;
    description?: string;
    tags: string[];
    locator: ProjectLocator;
    headRevision: string;
}

export interface LoadedProject {
    locator: ProjectLocator;
    revision: string; // opaque concurrency token; never part of the bundle
    bundle: ProjectBundle;
}

export interface SaveResult {
    revision: string;
    descriptor: ProjectDescriptor;
}

export function emptyDocumentation(): DocumentationDocument {
    return {schemaVersion: 1, byPath: {}};
}

export function emptyTests(): TestSuitesDocument {
    return {schemaVersion: 1, subjects: {}};
}

export function emptyFlow(): FlowMetadataDocument {
    return {schemaVersion: 1, layout: {positions: {}, outputs: []}};
}

export function describeProject(bundle: ProjectBundle, locator: ProjectLocator, revision: string): ProjectDescriptor {
    const {projectId, name, description, tags} = bundle.manifest;
    return {projectId, name, description, tags: tags ?? [], locator, headRevision: revision};
}

export function locatorKey(locator: ProjectLocator): string {
    return JSON.stringify([locator.provider, locator.resource, locator.projectPath]);
}
