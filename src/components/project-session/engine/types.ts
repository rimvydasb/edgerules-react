import type {PortableError, PortableNode, PortableRootContext} from '@edgerules/portable';
import type {GetFilter, SolverHandler, SolverInfo} from '@edgerules/web';

/**
 * Structural subset of one `MutableDecisionService` instance that a project uses. Declared locally so the
 * `@edgerules/web` and `@edgerules/node` builds, whose instance types differ only in their WASM handle, both fit.
 */
export interface EngineService {
    get(path: string, filter?: GetFilter): PortableNode | PortableError;
    getCode(path: string, filter?: GetFilter): string | PortableError;
    set(path: string, node: PortableNode): PortableNode | PortableError;
    setCode(path: string, code: string): PortableNode | PortableError;
    remove(path: string): void | PortableError;
    rename(path: string, newName: string): void | PortableError;
    link(): void;
    toPortable(): PortableRootContext;
    execute(method: string, input?: Record<string, unknown>): Promise<unknown>;
    registerSolver(handler: SolverHandler, info?: SolverInfo): () => void;
    requiresSolver(): boolean;
    readonly solverHandler?: SolverHandler;
    [Symbol.dispose](): void;
}

/**
 * The engine class: `MutableDecisionService` from `@edgerules/web/mutable` (after `await init()`) in a browser, or
 * from `@edgerules/node/mutable` under Node. Its static `diagnostics`/`completions` also make it the editors'
 * `languageService`.
 */
export interface ProjectEngineClass {
    fromCode(code: string): EngineService;
    fromPortable(model: PortableRootContext): EngineService;
}

/**
 * The session's model, as editors see it. It has the `MutableDecisionService` surface the components need, so it
 * is passed wherever they take a `service`. It survives `commitDsl`: the instance behind it is replaced, the facade
 * is not. Every `set`, `setCode`, `remove` and `rename` counts as a model change of the session, whether or not the
 * engine reports an error, since a failed write may still have changed the model.
 */
export interface ProjectEngine extends Omit<EngineService, typeof Symbol.dispose> {
    // The whole model as canonical DSL (`getCode('*')`): what a save writes.
    exportDsl(): string;
}
