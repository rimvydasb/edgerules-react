import {useMemo, type ReactElement} from 'react';
import {highlightEdgeRules} from '../code-editor/language/highlight';
import {cx} from '#ui/cx';
import * as classes from './highlightedCode.module.css';

export interface HighlightedCodeProps {
    code: string;
    className?: string;
}

/**
 * Display-only EdgeRules DSL text: static `tok-*` spans in the same colours and font as
 * `CodeEditorCell`, so a table cell does not change look when it swaps into its editor. No
 * CodeMirror view is created — cheap enough for every display cell of a grid.
 */
export function HighlightedCode({code, className}: HighlightedCodeProps): ReactElement {
    const spans = useMemo(() => highlightEdgeRules(code), [code]);
    return (
        <span data-code="" className={cx(classes.code, className)}>
            {spans.map((span, index) =>
                span.className ? (
                    // eslint-disable-next-line react/no-array-index-key
                    <span key={index} className={span.className}>
                        {span.text}
                    </span>
                ) : (
                    span.text
                ),
            )}
        </span>
    );
}
