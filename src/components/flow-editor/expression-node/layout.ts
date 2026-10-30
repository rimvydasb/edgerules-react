import {FONTS, KEBAB_WIDTH, measureText, TILE_WIDTH} from '../core-node';

const STEP = 40;
const MIN_STEPS = 4;
const MAX_STEPS = 8;
// Padding of the title on both sides.
const TITLE_PADDING = 20;

/** The short name an ExpressionNode shows: the last key of its field path. */
export function expressionTitle(field: string): string {
    return field.split('.').at(-1)!;
}

/** The width of an ExpressionNode in whole 40px steps: tile, title and kebab (4 to 8 steps). */
export function expressionNodeWidth(field: string): number {
    const content = TILE_WIDTH + TITLE_PADDING + measureText(expressionTitle(field), FONTS.title) + KEBAB_WIDTH;
    return Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.ceil(content / STEP))) * STEP;
}
