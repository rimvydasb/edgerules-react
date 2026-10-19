import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {TrackLayout} from '../core-node';
import type {InputNodeModel} from './types';

/** The text of a nested record, which has no single expression to edit. */
export const RECORD_VALUE = '{ … }';

/** The input line text: the record shape, for example '{ age, income }'. */
export function recordSummary(model: InputNodeModel): string {
    return `{ ${model.fields.map((item) => item.name).join(', ')} }`;
}

/** An InputNode is a two-column table: the field names on the left, the values with their pins on the right. */
export function computeInputNodeLayout(model: InputNodeModel): TrackLayout {
    return computeTrackLayout({
        titleWidth: titleLineWidth(model.label ?? model.field, model.field),
        summaryWidth: summaryLineWidth('input', measureText(recordSummary(model), FONTS.ret) + 28),
        // The row kebab sits at the end of the name cell.
        inputNameWidths: model.fields.map((item) => measureText(item.name, FONTS.name) + 28),
        outputNameWidths: model.fields.map((item) => measureText(item.value ?? RECORD_VALUE, FONTS.value)),
    });
}

export function useInputNodeLayout(model: InputNodeModel): TrackLayout {
    return useMemo(() => computeInputNodeLayout(model), [model]);
}
