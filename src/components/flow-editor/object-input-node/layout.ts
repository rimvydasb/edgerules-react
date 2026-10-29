import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {TrackLayout} from '../core-node';
import type {ObjectInputField, ObjectInputNodeModel} from './types';

/** The text of a nested record, which has no single expression to edit. */
export const RECORD_VALUE = '{ … }';

/** The node shows at most this many fields, then a `…` row; the full record shows beside the canvas. */
export const FIELD_LIMIT = 128;

// Horizontal padding of a value cell.
const VALUE_PADDING = 24;

/** The fields the node shows: the first FIELD_LIMIT. */
export function shownFields(model: ObjectInputNodeModel): ObjectInputField[] {
    return model.fields.length > FIELD_LIMIT ? model.fields.slice(0, FIELD_LIMIT) : model.fields;
}

// The input line names at most this many fields, so a large record keeps a narrow header.
const SUMMARY_NAMES = 5;

/** The input line text: the record shape, for example '{ age, income }'; a larger record ends with `…`. */
export function recordSummary(model: ObjectInputNodeModel): string {
    const names = model.fields.slice(0, SUMMARY_NAMES).map((item) => item.name);
    if (model.fields.length > SUMMARY_NAMES) names.push('…');
    return `{ ${names.join(', ')} }`;
}

function valueWidth(item: ObjectInputField): number {
    // A declaration has no value to show.
    return item.declaration ? 0 : measureText(item.value ?? RECORD_VALUE, FONTS.value);
}

/** An ObjectInputNode is a two-column table: the field names on the left, the values with their pins on the right. */
export function computeObjectInputNodeLayout(model: ObjectInputNodeModel): TrackLayout {
    const fields = shownFields(model);
    return computeTrackLayout({
        titleWidth: titleLineWidth(model.label ?? model.field, model.field),
        summaryWidth: summaryLineWidth('input', measureText(recordSummary(model), FONTS.ret) + 28),
        // The row kebab sits at the end of the name cell, and a declaration kind icon at its start.
        inputNameWidths: fields.map((item) => measureText(item.name, FONTS.name) + (item.declaration ? 48 : 28)),
        outputNameWidths: fields.map(valueWidth),
    });
}

export function useObjectInputNodeLayout(model: ObjectInputNodeModel): TrackLayout {
    return useMemo(() => computeObjectInputNodeLayout(model), [model]);
}

/** True when the node shows only a part of the record: more than FIELD_LIMIT fields, or a value cut off. */
export function isReducedObjectInput(
    model: ObjectInputNodeModel,
    layout: TrackLayout = computeObjectInputNodeLayout(model),
): boolean {
    if (model.fields.length > FIELD_LIMIT) return true;
    return model.fields.some((item) => valueWidth(item) + VALUE_PADDING > layout.outputTrack);
}
