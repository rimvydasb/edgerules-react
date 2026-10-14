import type {ReactElement, ReactNode} from 'react';
import * as classes from '../boxedEditor.module.css';
import type {BoxedRowData} from '../boxed-editor-types';
import {CELL, isBlock} from './layout';

export interface BlockProps {
    /** The block's own (header) row — the closing line starts at its indent. */
    row: BoxedRowData;
    children?: ReactNode;
}

/**
 * Wraps a row and everything it renders below it. When the row is a block (`isBlock`), the group
 * closes with a double line drawn inside its last row's bottom 3px — the block boundary stays on
 * the step grid while every line inside it stays a single 1px line. Any other row renders as is.
 *
 * Used by `RowSwitch` and by the hosts that render their child rows directly, so the rule lives in
 * one place (`isBlock`) and a new row kind is separated just by being listed there.
 */
export function Block({row, children}: BlockProps): ReactElement {
    if (!isBlock(row)) return <>{children}</>;
    return (
        <div
            data-block={row.path}
            className={classes.block}
            style={{['--block-indent' as string]: `${row.depth * CELL}px`}}
        >
            {children}
        </div>
    );
}
