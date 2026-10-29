import {IconDotsVertical} from '@tabler/icons-react';
import {forwardRef, type ButtonHTMLAttributes, type ReactNode} from 'react';
import {cx} from '#ui/cx';
import * as classes from '../boxedEditor.module.css';

export interface RowActionsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Replaces the three-dot icon (e.g. the header's `plus`, whose menu only adds). */
    icon?: ReactNode;
}

/**
 * The context-menu button (a vertical three-dot icon by default), one `ActionsColumn` cell wide. It forwards its ref and
 * remaining props so it can be the target of a `RowActionsMenu`.
 */
export const RowActionsButton = forwardRef<HTMLButtonElement, RowActionsButtonProps>(function RowActionsButton(
    {className, icon, ...rest},
    ref,
) {
    return (
        <button
            ref={ref}
            type="button"
            aria-label="Open row actions"
            className={cx(classes.actionsButton, className)}
            {...rest}
        >
            {icon ?? <IconDotsVertical size={20} />}
        </button>
    );
});
