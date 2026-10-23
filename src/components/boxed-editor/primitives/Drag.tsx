import {IconGripVertical} from '@tabler/icons-react';
import type {DraggableAttributes, DraggableSyntheticListeners} from '@dnd-kit/core';
import type {ReactElement} from 'react';
import {cx} from '#ui/cx';
import * as classes from '../boxedEditor.module.css';

export interface DragProps {
    dragRef?: (element: HTMLElement | null) => void;
    dragListeners?: DraggableSyntheticListeners;
    dragAttributes?: DraggableAttributes;
    /** `false` keeps the handle visible but inert — non-sortable kind or `readOnly` (Resolved
     * Decision #4: neither hidden nor greyed, just non-interactive). */
    draggable?: boolean;
}

/** The 6-dot expression-row drag handle — draggable rows wire it via `useRowDrag` (Phase 6). */
export function Drag({dragRef, dragListeners, dragAttributes, draggable = false}: DragProps): ReactElement {
    return (
        <div
            ref={dragRef}
            aria-label="Drag to reorder row"
            {...dragListeners}
            {...dragAttributes}
            className={cx(classes.handle, classes.dragCell, draggable && classes.draggable)}
        >
            <IconGripVertical size={19} />
        </div>
    );
}
