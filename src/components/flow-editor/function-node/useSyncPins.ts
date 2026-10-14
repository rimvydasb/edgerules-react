import {useUpdateNodeInternals} from '@xyflow/react';
import {useLayoutEffect} from 'react';

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
