import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {TrackLayout} from '../core-node';
import type {ValueInputNodeModel} from './types';

// Horizontal padding of the value cell.
const VALUE_PADDING = 24;

/** A ValueInputNode has one row: the value with the output pin, in the output track only. */
export function computeValueInputNodeLayout(model: ValueInputNodeModel): TrackLayout {
    return computeTrackLayout({
        titleWidth: titleLineWidth(model.label ?? model.field, model.field),
        summaryWidth: summaryLineWidth('input', measureText(model.type, FONTS.ret)),
        inputNameWidths: [],
        outputNameWidths: [measureText(model.value ?? '', FONTS.value)],
    });
}

export function useValueInputNodeLayout(model: ValueInputNodeModel): TrackLayout {
    return useMemo(() => computeValueInputNodeLayout(model), [model]);
}

/** True when the value is cut off: it is wider than the node can grow. */
export function isReducedValueInput(
    model: ValueInputNodeModel,
    layout: TrackLayout = computeValueInputNodeLayout(model),
): boolean {
    return measureText(model.value ?? '', FONTS.value) + VALUE_PADDING > layout.outputTrack;
}
