import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {TrackLayout} from '../core-node';
import {RECORD_VALUE} from '../object-input-node/layout';
import type {ReturnNodeModel} from './types';

/** The text of the last row: an input pin that adds the value wired into it to the return. */
export const ADD_ROW_TEXT = 'Wire a value here';

// The returns line names at most this many fields, so a large result keeps a narrow header.
const SUMMARY_NAMES = 5;

/**
 * The returns line text: the shape of a context, for example '{ payment, schedule }', where a larger context ends with
 * `…`; the type of an expression, for example 'number'.
 */
export function returnSummary(model: ReturnNodeModel): string {
    if (model.expression !== undefined) return model.type ?? 'any';
    const names = model.fields.slice(0, SUMMARY_NAMES).map((item) => item.name);
    if (model.fields.length > SUMMARY_NAMES) names.push('…');
    return `{ ${names.join(', ')} }`;
}

/**
 * A ReturnNode of a context is a two-column table: the field names with their input pins on the left, the expressions
 * on the right. A ReturnNode of an expression is one row: the input pin and the expression text.
 */
export function computeReturnNodeLayout(model: ReturnNodeModel): TrackLayout {
    if (model.expression !== undefined) {
        return computeTrackLayout({
            titleWidth: titleLineWidth(model.label ?? 'Return', model.field),
            summaryWidth: summaryLineWidth('returns', measureText(returnSummary(model), FONTS.ret)),
            inputNameWidths: [],
            outputNameWidths: [measureText(model.expression, FONTS.value)],
        });
    }
    return computeTrackLayout({
        titleWidth: titleLineWidth(model.label ?? 'Return', model.field),
        summaryWidth: summaryLineWidth('returns', measureText(returnSummary(model), FONTS.ret)),
        // The row kebab sits at the end of the name cell.
        inputNameWidths: [
            ...model.fields.map((item) => measureText(item.name, FONTS.name) + 28),
            measureText(ADD_ROW_TEXT, FONTS.name),
        ],
        outputNameWidths: model.fields.map((item) => measureText(item.value ?? RECORD_VALUE, FONTS.value)),
    });
}

export function useReturnNodeLayout(model: ReturnNodeModel): TrackLayout {
    return useMemo(() => computeReturnNodeLayout(model), [model]);
}
