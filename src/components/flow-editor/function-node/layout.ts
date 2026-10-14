import {useMemo} from 'react';
import {computeTrackLayout, FONTS, measureText, summaryLineWidth, titleLineWidth} from '../core-node';
import type {TrackLayout} from '../core-node';
import type {FunctionNodeModel} from './types';

const DRAFT_BADGE_WIDTH = 52;
const EMPTY_PLACEHOLDER = 'Select a function or ruleset…';

/** The calls line: callee chip and return type, or the empty chip placeholder. */
function callsContentWidth(model: FunctionNodeModel): number {
    const {callee} = model;
    if (!callee) return measureText(EMPTY_PLACEHOLDER, FONTS.placeholder) + 40;
    const chip = 14 + 6 + measureText(callee.path, FONTS.chip) + 6 + 12 + 16;
    return chip + 12 + measureText(`→ ${callee.returnLabel}`, FONTS.ret) + 28;
}

export function computeFunctionNodeLayout(model: FunctionNodeModel): TrackLayout {
    const showDraft = model.draft && model.callee !== undefined;
    const layout = computeTrackLayout({
        titleWidth: titleLineWidth(model.label ?? model.field, model.field, showDraft ? DRAFT_BADGE_WIDTH : 0),
        summaryWidth: summaryLineWidth('calls', callsContentWidth(model)),
        inputNameWidths: model.arguments.map((argument) => measureText(argument.name, FONTS.name) + 28),
        outputNameWidths: model.results.map((result) => measureText(result.name, FONTS.name)),
    });
    // A node without a callee has no body to size: the empty-state text sets 7 to 12 steps.
    return model.callee ? layout : {...layout, width: Math.min(480, Math.max(280, layout.width))};
}

export function useFunctionNodeLayout(model: FunctionNodeModel): TrackLayout {
    return useMemo(() => computeFunctionNodeLayout(model), [model]);
}
