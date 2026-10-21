import {Notification, Portal} from '@mantine/core';
import {useEffect, useRef, type ReactElement, type ReactNode} from 'react';
import * as classes from './toast.module.css';

export interface ToastProps {
    /** Whether the toast is visible. */
    open: boolean;
    message: ReactNode;
    /** Optional action, rendered after the message (e.g. an "Undo" button). */
    action?: ReactNode;
    /** Called when the toast times out or is dismissed. */
    onClose: () => void;
    /** Milliseconds until `onClose` fires. Defaults to 8000. */
    autoHideDuration?: number;
}

/** A transient message pinned to the bottom-left of the viewport (Mantine `Notification`). */
export function Toast({open, message, action, onClose, autoHideDuration = 8000}: ToastProps): ReactElement | null {
    // Held in a ref so a parent re-render with a fresh `onClose` closure does not restart the timer.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return undefined;
        const timer = setTimeout(() => onCloseRef.current(), autoHideDuration);
        return () => clearTimeout(timer);
    }, [open, autoHideDuration]);

    if (!open) return null;
    return (
        <Portal>
            <div className={classes.toast} role="status">
                <Notification withBorder onClose={onClose} closeButtonProps={{'aria-label': 'Dismiss'}}>
                    {message}
                    {action ? <div className={classes.action}>{action}</div> : null}
                </Notification>
            </div>
        </Portal>
    );
}
