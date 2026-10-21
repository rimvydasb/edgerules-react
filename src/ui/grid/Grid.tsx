import {
    forwardRef,
    type HTMLAttributes,
    type InputHTMLAttributes,
    type TableHTMLAttributes,
    type TdHTMLAttributes,
    type ThHTMLAttributes,
} from 'react';
import {cx} from '../cx';
import * as classes from './grid.module.css';

/**
 * Grid step in px — the side of one square of the ruled sheet. Shared by every grid in the library
 * (this table and the Boxed Editor treegrid), so their lines sit on the same rhythm.
 */
export const GRID_STEP = 40;

export interface GridTableProps extends TableHTMLAttributes<HTMLTableElement> {
    /**
     * Column widths in grid steps. When set, the table is laid out on the step grid: fixed column
     * widths of `units * GRID_STEP`, and every row at least one step tall.
     */
    columnUnits?: number[];
}

/** `<table>` with collapsed borders — adjacent cells share one 1px line. */
export const GridTable = forwardRef<HTMLTableElement, GridTableProps>(function GridTable(
    {columnUnits, className, style, children, ...rest},
    ref,
) {
    if (!columnUnits) {
        return (
            <table ref={ref} className={cx(classes.table, className)} style={style} {...rest}>
                {children}
            </table>
        );
    }
    const width = columnUnits.reduce((total, units) => total + units, 0) * GRID_STEP;
    return (
        <table ref={ref} className={cx(classes.table, classes.stepped, className)} style={{width, ...style}} {...rest}>
            <colgroup>
                {columnUnits.map((units, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <col key={index} style={{width: units * GRID_STEP}} />
                ))}
            </colgroup>
            {children}
        </table>
    );
});

export const GridHead = (props: HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} />;

export const GridBody = (props: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />;

export interface GridRowProps extends HTMLAttributes<HTMLTableRowElement> {
    /** Tint cells on hover. */
    hover?: boolean;
}

export const GridRow = forwardRef<HTMLTableRowElement, GridRowProps>(function GridRow(
    {hover, className, ...rest},
    ref,
) {
    return <tr ref={ref} className={cx(hover && classes.row, className)} {...rest} />;
});

interface GridCellOwnProps {
    /** Renders a `<th>` (column header) instead of a `<td>`. */
    header?: boolean;
    align?: 'left' | 'center' | 'right';
    /** No frame — for spacer and band-label cells. */
    borderless?: boolean;
    /** Zero padding + `position: relative`, so a {@link CellInput} can fill the cell. */
    fill?: boolean;
}

export type GridCellProps = GridCellOwnProps &
    TdHTMLAttributes<HTMLTableCellElement> &
    ThHTMLAttributes<HTMLTableCellElement>;

export const GridCell = forwardRef<HTMLTableCellElement, GridCellProps>(function GridCell(
    {header, align = 'left', borderless, fill, className, ...rest},
    ref,
) {
    const Tag = header ? 'th' : 'td';
    return (
        <Tag
            ref={ref}
            className={cx(
                classes.cell,
                align === 'center' && classes.center,
                align === 'right' && classes.right,
                borderless && classes.borderless,
                fill && classes.fill,
                className,
            )}
            {...rest}
        />
    );
});

/** Plain `<input>` that fills its {@link GridCell} (`fill`). Never wrap this in a library component. */
export const CellInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function CellInput(
    {className, ...rest},
    ref,
) {
    return <input ref={ref} className={cx(classes.input, className)} {...rest} />;
});
