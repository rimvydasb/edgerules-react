import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {TrackLayout} from '../core-node';
import {RECORD_VALUE} from '../object-input-node/layout';
import type {ResultNodeModel} from './types';

/** The text of the last row: an input pin that adds the value wired into it to the result. */
export const ADD_ROW_TEXT = 'Wire a value here';

// The returns line names at most this many fields, so a large result keeps a narrow header.
const SUMMARY_NAMES = 5;

/** The returns line text: the result shape, for example '{ payment, schedule }'; a larger result ends with `…`. */
export function resultSummary(model: ResultNodeModel): string {
    const names = model.fields.slice(0, SUMMARY_NAMES).map((item) => item.name);
    if (model.fields.length > SUMMARY_NAMES) names.push('…');
    return `{ ${names.join(', ')} }`;
}

/** A ResultNode is a two-column table: the field names with their input pins on the left, the expressions on the right. */
export function computeResultNodeLayout(model: ResultNodeModel): TrackLayout {
    return computeTrackLayout({
        titleWidth: titleLineWidth(model.label ?? 'Result', model.field),
        summaryWidth: summaryLineWidth('returns', measureText(resultSummary(model), FONTS.ret)),
        // The row kebab sits at the end of the name cell.
        inputNameWidths: [
            ...model.fields.map((item) => measureText(item.name, FONTS.name) + 28),
            measureText(ADD_ROW_TEXT, FONTS.name),
        ],
        outputNameWidths: model.fields.map((item) => measureText(item.value ?? RECORD_VALUE, FONTS.value)),
    });
}

export function useResultNodeLayout(model: ResultNodeModel): TrackLayout {
    return useMemo(() => computeResultNodeLayout(model), [model]);
}
