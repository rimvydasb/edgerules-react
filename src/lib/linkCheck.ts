import type {PortableError, PortableNode} from '@edgerules/portable';
import {isPortableError} from './portable';

/** Structural subset of `MutableDecisionService` that `setWithLinkCheck` uses. */
export interface LinkCheckService {
    set(path: string, node: PortableNode): PortableNode | PortableError;
    remove(path: string): void | PortableError;
    link(): void;
}

/**
 * Writes `node` at `writePath`, then confirms the model still links — `set()` itself never rolls
 * back or throws for a linking reason anymore (`CRUD_SPEC.md` §2, ex-`LINKING_FIX.md` §3.5), so a write that leaves the
 * model unlinkable must be caught and undone here instead. Scoped to `setBoxedRowData` only: a
 * value edit is expected to be self-contained, so an edit that breaks linking is rejected in place,
 * same as the old (pre-upgrade) engine's implicit set()-rollback behavior. `remove`/`rename`/`move`
 * deliberately keep no such check (Resolved Decision #12, `phase-08-quality-gate.md`) — those may
 * legitimately leave a *different* row's reference dangling, and rolling them back would make
 * renaming/removing anything another row still refers to impossible.
 */
export function setWithLinkCheck(
    mutable: LinkCheckService,
    writePath: string,
    writeNode: PortableNode,
    previousNode: PortableNode | undefined,
): PortableNode | PortableError {
    let previousLinkError: PortableError | undefined;
    try {
        mutable.link();
    } catch (error) {
        previousLinkError = error as PortableError;
    }
    const result = mutable.set(writePath, writeNode);
    if (isPortableError(result)) return result;
    try {
        mutable.link();
        return result;
    } catch (linkError) {
        const nextLinkError = linkError as PortableError;
        // An already-dangling reference is a model-level problem, not a global mutation latch.
        // Preserve an unrelated valid write when linking still reports the same pre-existing fault.
        if (
            previousLinkError &&
            previousLinkError.type === nextLinkError.type &&
            previousLinkError.path === nextLinkError.path &&
            previousLinkError.message === nextLinkError.message
        ) {
            return result;
        }
        if (previousNode === undefined) {
            mutable.remove(writePath);
        } else {
            mutable.set(writePath, previousNode);
        }
        return nextLinkError;
    }
}
