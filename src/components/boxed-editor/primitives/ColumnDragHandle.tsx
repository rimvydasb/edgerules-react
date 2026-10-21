import {IconGripVertical} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import * as classes from '../boxedEditor.module.css';

/** Compact drag affordance for a header cell inside `ArgumentHeaders` (Phase 4+). */
export function ColumnDragHandle(): ReactElement {
    return (
        <div aria-label="Drag to reorder column" className={classes.columnDragHandle}>
            <IconGripVertical size={17} />
        </div>
    );
}
