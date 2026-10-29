import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {TrackLayout} from '../core-node';
import type {ListInputNodeModel} from './types';

/** The input line text: the list type and, once the engine has read the list, the number of items. */
export function listSummary(model: ListInputNodeModel, count?: number): string {
    if (count === undefined) return model.type;
    return `${model.type} · ${count} ${count === 1 ? 'item' : 'items'}`;
}

/** A ListInputNode is a two-column table of the item shape: the field names on the left, their types on the right. */
export function computeListInputNodeLayout(model: ListInputNodeModel, count?: number): TrackLayout {
    return computeTrackLayout({
        titleWidth: titleLineWidth(model.label ?? model.field, model.field),
        // The whole-list pin sits at the end of the summary line.
        summaryWidth: summaryLineWidth('input', measureText(listSummary(model, count), FONTS.ret) + 28),
        inputNameWidths: model.itemFields.map((item) => measureText(item.name, FONTS.name)),
        outputNameWidths: model.itemFields.map((item) => measureText(item.type, FONTS.value)),
    });
}

export function useListInputNodeLayout(model: ListInputNodeModel, count?: number): TrackLayout {
    return useMemo(() => computeListInputNodeLayout(model, count), [model, count]);
}
