import type {ReactElement} from 'react';
import type {BoxedRowData} from '../boxed-editor-types';
import {ExpressionCell} from '../cells/ExpressionCell';
import {useRowActions} from '../hooks/useRowActions';
import {GenericRow} from './GenericRow';

export interface OptimisationConstraintRowProps {
    row: BoxedRowData;
}

/** One named linear constraint — draggable, `Duplicate`/`Delete`. */
export function OptimisationConstraintRow({row}: OptimisationConstraintRowProps): ReactElement {
    const actions = useRowActions(row);
    return (
        <GenericRow
            row={row}
            name={row.name}
            value={<ExpressionCell row={row} />}
            valueIsInteractive
            depth={row.depth}
            actions={actions}
        />
    );
}
