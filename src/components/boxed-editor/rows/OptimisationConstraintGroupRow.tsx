import {Fragment, type ReactElement} from 'react';
import type {BoxedRowData} from '../boxed-editor-types';
import {useRowActions} from '../hooks/useRowActions';
import {SettingRow} from '../primitives';
import {NewRow} from './NewRow';
import {OptimisationConstraintRow} from './OptimisationConstraintRow';

export interface OptimisationConstraintGroupRowProps {
    row: BoxedRowData;
}

/** Fixed `constraints:` section header — `Add Constraint`, not draggable. */
export function OptimisationConstraintGroupRow({row}: OptimisationConstraintGroupRowProps): ReactElement {
    const actions = useRowActions(row);
    return (
        <Fragment>
            <SettingRow row={row} name={row.name} depth={row.depth} occupiesNameAndValue showActions actions={actions} />
            {row.children?.map((child) => (
                <OptimisationConstraintRow key={child.path} row={child} />
            ))}
            <NewRow row={row} />
        </Fragment>
    );
}
