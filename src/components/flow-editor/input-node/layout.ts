import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {TrackLayout} from '../core-node';
import type {InputNodeModel} from './types';

/** The input line text: the record shape, for example '{ age, income }'. */
export function recordSummary(model: InputNodeModel): string {
    return `{ ${model.fields.map((item) => item.name).join(', ')} }`;
}

/** An InputNode has only the output track: one row per record field. */
export function computeInputNodeLayout(model: InputNodeModel): TrackLayout {
    return computeTrackLayout({
        titleWidth: titleLineWidth(model.label ?? model.field, model.field),
        summaryWidth: summaryLineWidth('input', measureText(recordSummary(model), FONTS.ret) + 28),
        inputNameWidths: [],
        outputNameWidths: model.fields.map((item) => measureText(item.name, FONTS.name)),
    });
}

export function useInputNodeLayout(model: InputNodeModel): TrackLayout {
    return useMemo(() => computeInputNodeLayout(model), [model]);
}
