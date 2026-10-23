import {Tooltip} from '@mantine/core';
import type {CSSProperties, ReactElement, ReactNode} from 'react';
import {cx} from '#ui/cx';
import {useAltHeld} from '../hooks/useAltHeld';
import * as classes from '../boxedEditor.module.css';

export interface TypeNameProps {
    /** Undefined suppresses the tooltip entirely — used to honour `showType={false}`. */
    type?: string;
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
}

/**
 * Every construct's type lives in a tooltip on its owning name/header cell: hover opens just
 * that one tooltip, holding Alt anywhere opens every `TypeName` tooltip in the tree at once
 * (Resolved Decision #9).
 */
export function TypeName({type, children, className, style}: TypeNameProps): ReactElement {
    const altHeld = useAltHeld();
    const span = (
        <span className={cx(classes.ellipsis, className)} style={style}>
            {children}
        </span>
    );
    if (!type) return span;
    // `opened` is only forced open while Alt is held; otherwise Mantine's own hover handling applies.
    return (
        <Tooltip label={type} withArrow opened={altHeld ? true : undefined} withinPortal>
            {span}
        </Tooltip>
    );
}
