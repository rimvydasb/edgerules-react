import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {TrackLayout} from '../core-node';
import type {ParameterNodeModel} from './types';

/**
 * A ParameterNode of a record type is a two-column table: the field names on the left, the field types with their pins
 * on the right. Any other type has one row: the type with the pin, in the output track only.
 */
export function computeParameterNodeLayout(model: ParameterNodeModel): TrackLayout {
    const record = model.fields.length > 0;
    return computeTrackLayout({
        titleWidth: titleLineWidth(model.name, model.field),
        // The whole-value pin of a record sits at the end of the summary line.
        summaryWidth: summaryLineWidth('parameter', measureText(model.type, FONTS.ret) + (record ? 28 : 0)),
        inputNameWidths: model.fields.map((item) => measureText(item.name, FONTS.name)),
        outputNameWidths: record
            ? model.fields.map((item) => measureText(item.type, FONTS.value))
            : [measureText(model.type, FONTS.value)],
    });
}

export function useParameterNodeLayout(model: ParameterNodeModel): TrackLayout {
    return useMemo(() => computeParameterNodeLayout(model), [model]);
}
