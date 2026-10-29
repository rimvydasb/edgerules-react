import {useMemo} from 'react';
import {useModelReading, useServiceRead} from '../core-node';
import type {FlowEditorService} from '../flow-editor-types';
import {isReducedObjectInput} from '../object-input-node/layout';
import {isReduced, outputShape} from '../output-node/outputShape';
import {isReducedValueInput} from '../value-input-node/layout';
import type {FlowSelection} from './types';

/**
 * True when the selected node shows only a part of its data: an Output node or a ListInputNode whose table is cut
 * at its row or column limit, an ObjectInputNode with more fields than it shows or with a value cut off, or a
 * ValueInputNode with its value cut off. It reads again after every change.
 */
export function useReducedSelection(service: FlowEditorService, selection: FlowSelection | undefined): boolean {
    const kind = selection?.kind;
    const field = selection && 'field' in selection ? selection.field : undefined;
    // An Output node and a ListInputNode draw the engine value of a path as a table.
    const path = selection?.kind === 'output' ? selection.source : kind === 'list-input' ? field : undefined;
    const reading = useModelReading(service, path);
    const tableReduced = useMemo(
        () => reading !== undefined && !('error' in reading) && isReduced(outputShape(reading.value, reading.columns)),
        [reading],
    );
    const inputReduced = useServiceRead(service, `${kind}:${field}`, () => {
        if (field === undefined) return false;
        if (kind === 'object-input') return isReducedObjectInput(service.getObjectInputNode(field));
        if (kind === 'value-input') return isReducedValueInput(service.getValueInputNode(field));
        return false;
    });
    return tableReduced || inputReduced;
}
