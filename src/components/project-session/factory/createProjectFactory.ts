import type {PortableRootContext} from '@edgerules/portable';
import {parseProjectBundle} from '../bundle/parseProjectBundle';
import {
    DEFAULT_MODEL_SOURCE,
    PROJECT_FORMAT_VERSION,
    emptyDocumentation,
    emptyFlow,
    emptyTests,
    type DocumentationDocument,
    type FlowMetadataDocument,
    type ModelMetadata,
    type ProjectBundle,
    type TestSuitesDocument,
} from '../bundle/types';
import type {EngineService, ProjectEngineClass} from '../engine/types';
import {ProjectError, messageOf} from '../errors';

export interface ProjectBundleInput {
    name: string;
    description?: string;
    tags?: string[];
    // DSL is kept as written; Portable is converted to canonical DSL. `name` and `version` default to the
    // `@model-name` and `@model-version` of a Portable model.
    model: ({dsl: string} | {portable: PortableRootContext}) & ModelMetadata;
    // Optional slices, in the form `exportBundle` produces them; each defaults to empty.
    documentation?: DocumentationDocument;
    tests?: TestSuitesDocument;
    flow?: FlowMetadataDocument;
}

// Turns a model and optional slices into a new `ProjectBundle` with a fresh `projectId`. Persisting it is the
// caller's job (`repository.create`).
export interface ProjectFactory {
    // Throws `ProjectError`: `invalid-model` when the model does not parse or link, `invalid-bundle` for a bad slice.
    createBundle(input: ProjectBundleInput): ProjectBundle;
}

export interface ProjectFactoryOptions {
    engine: ProjectEngineClass;
}

function newProjectId(): string {
    return crypto.randomUUID();
}

export function createProjectFactory({engine}: ProjectFactoryOptions): ProjectFactory {
    // Builds a throwaway engine to check the model, and reads its DSL when the input is Portable.
    function toDsl(model: ProjectBundleInput['model']): string {
        let instance: EngineService | undefined;
        try {
            instance = 'dsl' in model ? engine.fromCode(model.dsl) : engine.fromPortable(model.portable);
            instance.link();
            if ('dsl' in model) return model.dsl;
            const code = instance.getCode('*');
            if (typeof code !== 'string') throw code;
            return code;
        } catch (error) {
            throw new ProjectError('invalid-model', messageOf(error), {cause: error});
        } finally {
            instance?.[Symbol.dispose]();
        }
    }

    // The model name and version of the input; blank values are left out.
    function metadataOf(model: ProjectBundleInput['model']): ModelMetadata {
        const root = 'portable' in model ? model.portable : undefined;
        const name = model.name ?? (typeof root?.['@model-name'] === 'string' ? root['@model-name'] : undefined);
        const version =
            model.version ?? (typeof root?.['@model-version'] === 'string' ? root['@model-version'] : undefined);
        return {...(name?.trim() ? {name: name.trim()} : {}), ...(version?.trim() ? {version: version.trim()} : {})};
    }

    return {
        createBundle(input) {
            return parseProjectBundle({
                manifest: {
                    kind: 'EdgeRulesProject',
                    formatVersion: PROJECT_FORMAT_VERSION,
                    projectId: newProjectId(),
                    name: input.name,
                    ...(input.description !== undefined && {description: input.description}),
                    ...(input.tags !== undefined && {tags: input.tags}),
                    model: {format: 'dsl', source: DEFAULT_MODEL_SOURCE, ...metadataOf(input.model)},
                },
                model: toDsl(input.model),
                documentation: input.documentation ?? emptyDocumentation(),
                tests: input.tests ?? emptyTests(),
                flow: input.flow ?? emptyFlow(),
            });
        },
    };
}
