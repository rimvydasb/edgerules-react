const STEP = 40;
const MIN_STEPS = 2;
const MAX_STEPS = 4;
// Horizontal room a name needs beside its pin and padding.
const NAME_PADDING = 32;

export interface FunctionNodeLayoutInput {
    titleWidth: number; // measured width of label plus field name plus badge
    calleeLineWidth: number; // measured width of the CALLS label, chip and return type
    argumentNameWidths: number[]; // measured widths of argument names
    resultNameWidths: number[]; // measured widths of result names
}

export interface FunctionNodeLayout {
    argumentTrack: number; // px, 0 when there are no arguments
    resultTrack: number; // px
    width: number; // px, argumentTrack + resultTrack
}

function stepsFor(nameWidths: number[]): number {
    const widest = Math.max(0, ...nameWidths);
    const steps = Math.ceil((widest + NAME_PADDING) / STEP);
    return Math.min(MAX_STEPS, Math.max(MIN_STEPS, steps));
}

/**
 * Track widths in whole 40px steps. Each track fits its widest name (2 to 4 steps). When the header
 * is wider than both tracks, the extra steps go half to each track, the larger half to the result
 * track. The description row never takes part.
 */
export function computeFunctionNodeLayout(input: FunctionNodeLayoutInput): FunctionNodeLayout {
    const hasArguments = input.argumentNameWidths.length > 0;
    let argumentSteps = hasArguments ? stepsFor(input.argumentNameWidths) : 0;
    let resultSteps = stepsFor(input.resultNameWidths);

    const headerSteps = Math.ceil(Math.max(input.titleWidth, input.calleeLineWidth) / STEP);
    const extra = headerSteps - (argumentSteps + resultSteps);
    if (extra > 0) {
        if (hasArguments) {
            const argumentExtra = Math.floor(extra / 2);
            argumentSteps += argumentExtra;
            resultSteps += extra - argumentExtra;
        } else {
            resultSteps += extra;
        }
    }

    const argumentTrack = argumentSteps * STEP;
    const resultTrack = resultSteps * STEP;
    return {argumentTrack, resultTrack, width: argumentTrack + resultTrack};
}
