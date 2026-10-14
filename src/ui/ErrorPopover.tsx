import {Popover} from '@mantine/core';
import type {ReactElement, ReactNode} from 'react';
import * as classes from './errorPopover.module.css';

export interface ErrorPopoverProps {
    /** The message; the popover is shown while it is non-empty. */
    message?: string;
    children: ReactNode;
}

/**
 * An inline-validation popover anchored under `children`, aligned to the left edge of its anchor.
 * It renders in a portal, so a scroll container or `overflow: hidden` ancestor cannot clip it, and it
 * never takes focus from the field being edited.
 */
export function ErrorPopover({message, children}: ErrorPopoverProps): ReactElement {
    return (
        <Popover
            opened={Boolean(message)}
            position="bottom-start"
            offset={2}
            withinPortal
            transitionProps={{duration: 0}}
            closeOnClickOutside={false}
            closeOnEscape={false}
            trapFocus={false}
            returnFocus={false}
        >
            <Popover.Target>
                <div className={classes.anchor}>{children}</div>
            </Popover.Target>
            <Popover.Dropdown role="alert" className={classes.error}>
                {message}
            </Popover.Dropdown>
        </Popover>
    );
}
