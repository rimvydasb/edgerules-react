import {useNodeConnections} from '@xyflow/react';
import {useEffect, useState} from 'react';
import {useFlowEditor} from '../FlowEditorProvider';
import type {FlowEditorService} from '../flow-editor-types';
import {useServiceRead} from './hooks';

export type WiredReading = Awaited<ReturnType<FlowEditorService['readOutput']>>;

/**
 * The model path a wire into a node reads: `out:level` of `decision` reads `decision.level`. `out:result` reads the
 * whole node while it is the unnamed return of its callee, and the field `result` once the callee returns a record.
 */
export function sourcePath(
    service: Pick<FlowEditorService, 'getFunctionNode'>,
    nodeId: string,
    handleId: string | null | undefined,
): string {
    const name = handleId?.replace(/^out:/, '');
    if (!name || name === '*') return nodeId;
    if (name === 'result' && service.getFunctionNode(nodeId).results.some((result) => result.whole)) return nodeId;
    return `${nodeId}.${name}`;
}

/**
 * What the engine computes for the path wired into the input pin `handleId`; it reads again after every committed
 * change of the service. `reading` is undefined while nothing is wired and until the first read settles.
 */
export function useWiredReading(handleId: string): {source?: string; reading?: WiredReading} {
    const {service} = useFlowEditor();
    const [connection] = useNodeConnections({handleType: 'target', handleId});
    // The path follows the callee: its unnamed `result` becomes a field when its body becomes a record.
    const source = useServiceRead(service, `${connection?.source}:${connection?.sourceHandle}`, () =>
        connection ? sourcePath(service, connection.source, connection.sourceHandle) : undefined,
    );
    return {source, reading: useModelReading(service, source)};
}

/**
 * What the engine computes for the model path `source`; it reads again after every committed change of the service.
 * Undefined while `source` is undefined and until the first read of `source` settles.
 */
export function useModelReading(service: FlowEditorService, source: string | undefined): WiredReading | undefined {
    const [reading, setReading] = useState<WiredReading | undefined>();

    useEffect(() => {
        // The reading of another path never shows for this one.
        setReading(undefined);
        if (!source) return;
        let current = true;
        const refresh = () => {
            void service.readOutput(source).then((next) => {
                if (current) setReading(next);
            });
        };
        refresh();
        const unsubscribe = service.subscribe(refresh);
        return () => {
            current = false;
            unsubscribe();
        };
    }, [service, source]);

    return reading;
}
