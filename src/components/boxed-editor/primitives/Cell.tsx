import type {CSSProperties, ReactElement, ReactNode} from 'react';
import {cx} from '#ui/cx';
import * as classes from '../boxedEditor.module.css';
import type {BoxedColumn} from './layout';

export interface CellProps {
    children?: ReactNode;
    column?: BoxedColumn;
    style?: CSSProperties;
    /** No padding — the cell hosts a `SubGrid` whose lines must sit on the sheet's step lines. */
    flush?: boolean;
}

const columnClass: Record<BoxedColumn, string | undefined> = {
    value: undefined,
    description: classes.cellDescription,
    'test-results': classes.cellTestResults,
};

export function Cell({children, column = 'value', style, flush = false}: CellProps): ReactElement {
    return (
        <div
            data-column={column}
            className={cx(classes.cell, columnClass[column], flush && classes.cellFlush)}
            style={style}
        >
            {children}
        </div>
    );
}
