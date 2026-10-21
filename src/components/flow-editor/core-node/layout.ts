import {FONTS, measureText} from './measure';
import type {TrackLayout, TrackLayoutInput} from './types';

const STEP = 40;
const MIN_STEPS = 2;
const MAX_STEPS = 4;
// Horizontal room a name needs beside its pin and padding.
const NAME_PADDING = 32;

export const TILE_WIDTH = 40;
export const KEBAB_WIDTH = 40;

function stepsFor(nameWidths: number[]): number {
    const widest = Math.max(0, ...nameWidths);
    const steps = Math.ceil((widest + NAME_PADDING) / STEP);
    return Math.min(MAX_STEPS, Math.max(MIN_STEPS, steps));
}

/**
 * Track widths in whole 40px steps. Each track fits its widest name (2 to 4 steps). When the header
 * is wider than both tracks, the extra steps go half to each track, the larger half to the output
 * track. The description row never takes part.
 */
export function computeTrackLayout(input: TrackLayoutInput): TrackLayout {
    const hasInputs = input.inputNameWidths.length > 0;
    let inputSteps = hasInputs ? stepsFor(input.inputNameWidths) : 0;
    let outputSteps = stepsFor(input.outputNameWidths);

    const headerSteps = Math.ceil(Math.max(input.titleWidth, input.summaryWidth) / STEP);
    const extra = headerSteps - (inputSteps + outputSteps);
    if (extra > 0) {
        if (hasInputs) {
            const inputExtra = Math.floor(extra / 2);
            inputSteps += inputExtra;
            outputSteps += extra - inputExtra;
        } else {
            outputSteps += extra;
        }
    }

    const inputTrack = inputSteps * STEP;
    const outputTrack = outputSteps * STEP;
    return {inputTrack, outputTrack, width: inputTrack + outputTrack};
}

/** Width of the first header line: tile, title, field name, an optional badge and the kebab. */
export function titleLineWidth(title: string, field: string, badgeWidth = 0): number {
    return (
        TILE_WIDTH +
        10 +
        measureText(title, FONTS.title) +
        8 +
        measureText(field, FONTS.field) +
        badgeWidth +
        10 +
        KEBAB_WIDTH
    );
}

/** Width of the second header line: tile, the uppercase label and the content after it. */
export function summaryLineWidth(label: string, contentWidth: number): number {
    return TILE_WIDTH + 10 + measureText(label.toUpperCase(), FONTS.label) + 8 + contentWidth;
}
