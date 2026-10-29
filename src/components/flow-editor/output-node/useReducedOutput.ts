import {useMemo} from 'react';
import {useModelReading} from '../core-node';
import type {FlowEditorService} from '../flow-editor-types';
import {isReduced, outputShape} from './outputShape';

/** True when the OutputNode that reads `source` shows only a part of its value; it reads again after every change. */
export function useReducedOutput(service: FlowEditorService, source: string | undefined): boolean {
    const reading = useModelReading(service, source);
    return useMemo(
        () => reading !== undefined && !('error' in reading) && isReduced(outputShape(reading.value, reading.columns)),
        [reading],
    );
}
