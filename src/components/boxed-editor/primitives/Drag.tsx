import Box from '@mui/material/Box';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type {DraggableAttributes, DraggableSyntheticListeners} from '@dnd-kit/core';
import type {ReactElement} from 'react';
import {CELL} from './layout';

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
        <Box
            ref={dragRef}
            aria-label="Drag to reorder row"
            {...dragListeners}
            {...dragAttributes}
            sx={{
                display: 'flex',
                width: CELL,
                height: CELL,
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                bgcolor: 'action.hover',
                cursor: draggable ? 'grab' : undefined,
                touchAction: draggable ? 'none' : undefined,
                '&:active': draggable ? {cursor: 'grabbing'} : undefined,
            }}
        >
            <DragIndicatorIcon sx={{fontSize: 19, color: 'text.secondary'}} />
        </Box>
    );
}
