import type {CSSProperties, ReactElement, ReactNode} from 'react';
import {cx} from '#ui/cx';
import * as classes from '../boxedEditor.module.css';
import {CELL} from './layout';

export interface SubGridProps {
    children?: ReactNode;
    /** Draws the 1px step line under this line (the upper line of a tall header). */
    divided?: boolean;
}

/**
 * One 40 px line of nested columns inside a value cell (render the cell with `flush`). Its
 * children are {@link Track}s; stack two `SubGrid`s in a {@link SubGridStack} for a tall header.
 */
export function SubGrid({children, divided = false}: SubGridProps): ReactElement {
    return <div className={cx(classes.subGrid, divided && classes.subGridDivided)}>{children}</div>;
}

/** Two {@link SubGrid} lines filling a tall (80 px) value cell. */
export function SubGridStack({children}: {children?: ReactNode}): ReactElement {
    return <div className={classes.subGridStack}>{children}</div>;
}

export interface TrackProps {
    /** Width in grid steps (`CELL`). The last track of a line also absorbs the host cell's border pixel. */
    units: number;
    children?: ReactNode;
    /** 8 px inline padding for text content. Default `true`. */
    pad?: boolean;
    className?: string;
    style?: CSSProperties;
    'aria-hidden'?: boolean;
}

/** A whole-step nested column. Draws its 1px line on its own last pixel, like every top-level cell. */
export function Track({units, children, pad = true, className, style, ...rest}: TrackProps): ReactElement {
    return (
        <div
            className={cx(classes.track, pad && classes.pad, className)}
            style={{flexBasis: units * CELL, ...style}}
            {...rest}
        >
            {children}
        </div>
    );
}
