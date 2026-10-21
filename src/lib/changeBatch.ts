export type Unsubscribe = () => void;

/** A set of change listeners whose notifications can be deferred by the `ChangeBatch` that created it. */
export interface ListenerSet {
    subscribe(listener: () => void): Unsubscribe;
    // Calls every listener now, or once when the enclosing `ChangeBatch.run` finishes.
    notify(): void;
    clear(): void;
}

/**
 * Groups notifications: inside `run`, every `ListenerSet` created by this batch notifies at most once, after the
 * outermost `run` returns or throws. Lets one project transaction touch several stores and still publish one
 * notification per subscriber.
 */
export interface ChangeBatch {
    run<T>(work: () => T): T;
    createListenerSet(): ListenerSet;
}

export function createChangeBatch(): ChangeBatch {
    let depth = 0;
    const pending = new Set<() => void>();

    function flush(): void {
        // A listener may change state again; whatever it queues is flushed in the same loop.
        while (pending.size > 0) {
            const emits = [...pending];
            pending.clear();
            for (const emit of emits) emit();
        }
    }

    return {
        run<T>(work: () => T): T {
            depth += 1;
            try {
                return work();
            } finally {
                depth -= 1;
                if (depth === 0) flush();
            }
        },

        createListenerSet(): ListenerSet {
            const listeners = new Set<() => void>();
            const emit = (): void => {
                for (const listener of [...listeners]) listener();
            };
            return {
                subscribe(listener) {
                    listeners.add(listener);
                    return () => {
                        listeners.delete(listener);
                    };
                },
                notify() {
                    if (depth > 0) pending.add(emit);
                    else emit();
                },
                clear() {
                    listeners.clear();
                    pending.delete(emit);
                },
            };
        },
    };
}
