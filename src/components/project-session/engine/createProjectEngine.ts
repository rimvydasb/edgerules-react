import type {PortableError, PortableNode, PortableRootContext} from '@edgerules/portable';
import type {SolverHandler, SolverInfo} from '@edgerules/web';
import type {ModelMetadata} from '../bundle/types';
import {ProjectError, messageOf} from '../errors';
import type {EngineService, ProjectEngine, ProjectEngineClass} from './types';

interface SolverRegistration {
    handler: SolverHandler;
    info?: SolverInfo;
    unregister: () => void;
}

// The session's side of a `ProjectEngine`: swaps the instance behind the facade.
export interface EngineHandle {
    facade: ProjectEngine;
    // Builds a new instance from `dsl` and swaps it in. With `link` (the default) the model must also link.
    // Throws `ProjectError('invalid-model')` and keeps the current instance when it does not.
    load(dsl: string, options?: {link?: boolean}): void;
    dispose(): void;
}

function build(engineClass: ProjectEngineClass, dsl: string, link: boolean): EngineService {
    let instance: EngineService | undefined;
    try {
        instance = engineClass.fromCode(dsl);
        if (link) instance.link();
        return instance;
    } catch (error) {
        instance?.[Symbol.dispose]();
        throw new ProjectError('invalid-model', messageOf(error), {cause: error});
    }
}

// The model root with the metadata the engine does not keep.
function withMetadata<T extends PortableNode | PortableError | PortableRootContext>(
    root: T,
    metadata: ModelMetadata,
): T {
    if (typeof root !== 'object' || root === null || Array.isArray(root)) return root;
    if ((root as {'@kind'?: unknown})['@kind'] === 'error') return root;
    return {
        ...root,
        ...(metadata.name !== undefined && {'@model-name': metadata.name}),
        ...(metadata.version !== undefined && {'@model-version': metadata.version}),
    };
}

// `onChange` runs after every write through the facade; `metadata` is read on every read of the model root.
export function createProjectEngine(
    engineClass: ProjectEngineClass,
    dsl: string,
    onChange: () => void,
    metadata: () => ModelMetadata = () => ({}),
): EngineHandle {
    let current = build(engineClass, dsl, true);
    const solvers = new Set<SolverRegistration>();

    function write<T>(apply: (engine: EngineService) => T): T {
        try {
            return apply(current);
        } finally {
            onChange();
        }
    }

    const facade: ProjectEngine = {
        get: (path, filter) =>
            path === '*' ? withMetadata(current.get(path, filter), metadata()) : current.get(path, filter),
        getCode: (path, filter) => current.getCode(path, filter),
        toPortable: () => withMetadata(current.toPortable(), metadata()),
        execute: (method, input) => current.execute(method, input),
        requiresSolver: () => current.requiresSolver(),
        get solverHandler() {
            return current.solverHandler;
        },
        link: () => current.link(),

        set: (path, node) => write((engine) => engine.set(path, node)),
        setCode: (path, code) => write((engine) => engine.setCode(path, code)),
        remove: (path) => write((engine) => engine.remove(path)),
        rename: (path, newName) => write((engine) => engine.rename(path, newName)),

        // Kept across `commitDsl`, which replaces the instance a solver was registered on.
        registerSolver(handler, info) {
            const registration: SolverRegistration = {handler, info, unregister: current.registerSolver(handler, info)};
            solvers.add(registration);
            return () => {
                registration.unregister();
                solvers.delete(registration);
            };
        },

        exportDsl() {
            const code = current.getCode('*');
            if (typeof code !== 'string') throw new ProjectError('invalid-model', messageOf(code));
            return code;
        },
    };

    return {
        facade,

        load(nextDsl, {link = true} = {}) {
            const next = build(engineClass, nextDsl, link);
            for (const registration of solvers) {
                registration.unregister = next.registerSolver(registration.handler, registration.info);
            }
            const previous = current;
            current = next;
            previous[Symbol.dispose]();
        },

        dispose() {
            solvers.clear();
            current[Symbol.dispose]();
        },
    };
}
