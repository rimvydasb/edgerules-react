import Box from '@mui/material/Box';
import type {SxProps, Theme} from '@mui/material/styles';
import type {DraggableAttributes, DraggableSyntheticListeners} from '@dnd-kit/core';
import type {ReactElement, ReactNode} from 'react';
import {CELL} from './layout';

export interface TallIconHandleProps {
    children: ReactNode;
    /** Set when the icon itself is the row's drag handle (e.g. `complexType`). */
    ariaLabel?: string;
    sx?: SxProps<Theme>;
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
    sx,
    dragRef,
    dragListeners,
    dragAttributes,
    draggable = false,
}: TallIconHandleProps): ReactElement {
    return (
        <Box
            ref={dragRef}
            aria-label={ariaLabel}
            {...dragListeners}
            {...dragAttributes}
            sx={{
                display: 'flex',
                width: CELL,
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'stretch',
                borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                cursor: draggable ? 'grab' : undefined,
                touchAction: draggable ? 'none' : undefined,
                '&:active': draggable ? {cursor: 'grabbing'} : undefined,
                ...sx,
            }}
        >
            {children}
        </Box>
    );
}
