import type {CSSProperties, ReactElement, ReactNode} from 'react';
import {cx} from '../../../ui/cx';
import * as classes from '../boxedEditor.module.css';
import type {BoxedColumn} from './layout';

export interface CellProps {
    children?: ReactNode;
    column?: BoxedColumn;
    style?: CSSProperties;
}

const columnClass: Record<BoxedColumn, string | undefined> = {
    value: undefined,
    description: classes.cellDescription,
    'test-results': classes.cellTestResults,
};

export function Cell({children, column = 'value', style}: CellProps): ReactElement {
    return (
        <div data-column={column} className={cx(classes.cell, columnClass[column])} style={style}>
            {children}
        </div>
    );
}
