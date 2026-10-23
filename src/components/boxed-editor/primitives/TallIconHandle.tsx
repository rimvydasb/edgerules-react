import type {DraggableAttributes, DraggableSyntheticListeners} from '@dnd-kit/core';
import type {CSSProperties, ReactElement, ReactNode} from 'react';
import {cx} from '#ui/cx';
import * as classes from '../boxedEditor.module.css';

export interface TallIconHandleProps {
    children: ReactNode;
    /** Set when the icon itself is the row's drag handle (e.g. `complexType`). */
    ariaLabel?: string;
    style?: CSSProperties;
    dragRef?: (element: HTMLElement | null) => void;
    dragListeners?: DraggableSyntheticListeners;
    dragAttributes?: DraggableAttributes;
    /** `false` keeps the handle visible but inert — see `Drag`'s own doc. */
    draggable?: boolean;
}

/** Full-height (self-stretch) icon slot used by every tall (80 px) or icon-fronted row. */
export function TallIconHandle({
    children,
    ariaLabel,
    style,
    dragRef,
    dragListeners,
    dragAttributes,
    draggable = false,
}: TallIconHandleProps): ReactElement {
    return (
        <div
            ref={dragRef}
            aria-label={ariaLabel}
            {...dragListeners}
            {...dragAttributes}
            className={cx(classes.handle, draggable && classes.draggable)}
            style={style}
        >
            {children}
        </div>
    );
}
