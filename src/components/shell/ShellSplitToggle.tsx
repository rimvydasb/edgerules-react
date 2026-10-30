import {Tooltip} from '@mantine/core';
import {IconLayoutSidebarRight} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import {cx} from '#ui/cx';
import * as classes from './shell.module.css';

export interface ShellSplitToggleProps {
    open: boolean;
    disabled: boolean; // only the Flow view has a split screen
    onToggle: () => void;
}

/**
 * The header cell right of the view switch that splits the Flow view: the canvas on the left, the selected node on
 * the right. It is on by default and disabled in the other views.
 */
export function ShellSplitToggle({open, disabled, onToggle}: ShellSplitToggleProps): ReactElement {
    const label = disabled ? 'Split view is available in the Flow view' : open ? 'Close split view' : 'Split view';
    return (
        <Tooltip label={label} position="bottom-end" withArrow>
            <button
                type="button"
                aria-label="Split view"
                aria-pressed={open && !disabled}
                disabled={disabled}
                className={cx(classes.viewButton, classes.splitToggle, open && !disabled && classes.splitToggleOn)}
                onClick={onToggle}
                data-testid="shell-split-toggle"
            >
                <IconLayoutSidebarRight aria-hidden="true" size={18} />
            </button>
        </Tooltip>
    );
}
