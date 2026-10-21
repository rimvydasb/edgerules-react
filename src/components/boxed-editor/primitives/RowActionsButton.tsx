import {IconDotsVertical} from '@tabler/icons-react';
import {forwardRef, type ButtonHTMLAttributes} from 'react';
import {cx} from '../../../ui/cx';
import * as classes from '../boxedEditor.module.css';

export type RowActionsButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * The vertical three-dot context-menu button, one `ActionsColumn` cell wide. It forwards its ref and
 * remaining props so it can be the target of a `RowActionsMenu`.
 */
export const RowActionsButton = forwardRef<HTMLButtonElement, RowActionsButtonProps>(function RowActionsButton(
    {className, ...rest},
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
            <IconDotsVertical size={20} />
        </button>
    );
});
