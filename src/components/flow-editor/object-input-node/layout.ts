import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {TrackLayout} from '../core-node';
import type {ObjectInputNodeModel} from './types';

/** The text of a nested record, which has no single expression to edit. */
export const RECORD_VALUE = '{ … }';

/** The input line text: the record shape, for example '{ age, income }'. */
export function recordSummary(model: ObjectInputNodeModel): string {
    return `{ ${model.fields.map((item) => item.name).join(', ')} }`;
}

/** An ObjectInputNode is a two-column table: the field names on the left, the values with their pins on the right. */
export function computeObjectInputNodeLayout(model: ObjectInputNodeModel): TrackLayout {
    return computeTrackLayout({
        titleWidth: titleLineWidth(model.label ?? model.field, model.field),
        summaryWidth: summaryLineWidth('input', measureText(recordSummary(model), FONTS.ret) + 28),
        // The row kebab sits at the end of the name cell, and a declaration kind icon at its start.
        inputNameWidths: model.fields.map((item) => measureText(item.name, FONTS.name) + (item.declaration ? 48 : 28)),
        // A declaration has no value to show.
        outputNameWidths: model.fields.map((item) =>
            item.declaration ? 0 : measureText(item.value ?? RECORD_VALUE, FONTS.value),
        ),
    });
}

export function useObjectInputNodeLayout(model: ObjectInputNodeModel): TrackLayout {
    return useMemo(() => computeObjectInputNodeLayout(model), [model]);
}
