import {useUpdateNodeInternals} from '@xyflow/react';
import {useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore} from 'react';
import type {DocumentationService} from '../../documentation-service';
import type {FlowEditorService} from '../flow-editor-types';

/**
 * xyflow measures the handle positions of a node when it mounts or resizes. Reordering, adding or renaming a row
 * keeps the node size, so without this call the wires stay at the old pin positions. `pinKey` changes whenever
 * the ordered set of handles or the node width changes.
 */
export function useSyncPins(nodeId: string, pinKey: string): void {
    const updateNodeInternals = useUpdateNodeInternals();
    useLayoutEffect(() => {
        updateNodeInternals(nodeId);
    }, [updateNodeInternals, nodeId, pinKey]);
}

/** A node model read from the service; reads again after every committed change of the service. */
export function useServiceRead<T>(service: FlowEditorService, field: string, read: () => T): T {
    const [version, setVersion] = useState(0);
    useEffect(() => service.subscribe(() => setVersion((current) => current + 1)), [service]);
    // `version` is the cache key: the service builds a new model object on every read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(read, [service, field, version]);
}

const NO_DESCRIPTIONS = {subscribe: () => () => {}, getDescription: () => undefined};

/** The description of a node field; undefined without a documentation service. */
export function useNodeDescription(documentation: DocumentationService | undefined, field: string): string | undefined {
    const source = documentation ?? NO_DESCRIPTIONS;
    return useSyncExternalStore(source.subscribe, () => source.getDescription(field));
}
