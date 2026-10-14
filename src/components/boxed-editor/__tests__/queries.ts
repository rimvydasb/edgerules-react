import type {MatcherFunction, SelectorMatcherOptions} from '@testing-library/react';

/** Matches a cell's highlighted DSL text, which `HighlightedCode` splits into per-token spans. */
export function byCode(text: string): MatcherFunction {
    return (_content, element) => element?.hasAttribute('data-code') === true && element.textContent === text;
}

/** `getByText` options that skip highlighted code, so a header label isn't confused with a token. */
export const notCode: SelectorMatcherOptions = {ignore: 'script, style, [data-code], [data-code] *'};
