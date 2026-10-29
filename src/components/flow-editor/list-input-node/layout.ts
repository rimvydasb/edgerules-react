import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {ListInputNodeModel} from './types';

/** The input line text: the list type and, once the engine has read the list, the number of items. */
export function listSummary(model: ListInputNodeModel, count?: number): string {
    if (count === undefined) return model.type;
    return `${model.type} · ${count} ${count === 1 ? 'item' : 'items'}`;
}

/**
 * The least width of a ListInputNode, in whole steps: the header fits. The node grows past it to fit its table of
 * items.
 */
export function computeListInputNodeWidth(model: ListInputNodeModel, count?: number): number {
    return computeTrackLayout({
        titleWidth: titleLineWidth(model.label ?? model.field, model.field),
        // The whole-list pin sits at the end of the summary line.
        summaryWidth: summaryLineWidth('input', measureText(listSummary(model, count), FONTS.ret) + 28),
        inputNameWidths: [],
        outputNameWidths: [],
    }).width;
}

export function useListInputNodeWidth(model: ListInputNodeModel, count?: number): number {
    return useMemo(() => computeListInputNodeWidth(model, count), [model, count]);
}
