import {Fragment, type ReactElement} from 'react';
import type {BoxedRowData} from '../boxed-editor-types';
import {useBoxedEditorUi} from '../context/BoxedEditorUiContext';
import {useRowActions} from '../hooks/useRowActions';
import {GenericRow} from './GenericRow';
import {NewRow} from './NewRow';
import {RowSwitch} from './RowSwitch';

export interface ContextRowProps {
    row: BoxedRowData;
}

/** Named nested object that can contain other rows. */
export function ContextRow({row}: ContextRowProps): ReactElement {
    const {isExpanded} = useBoxedEditorUi();
    const expanded = isExpanded(row.path);
    const actions = useRowActions(row);

    return (
        <Fragment>
            <GenericRow row={row} name={row.name} depth={row.depth} occupiesNameAndValue strong actions={actions} />
            {expanded && (
                <Fragment>
                    {row.children?.map((child) => (
                        <RowSwitch key={child.path} row={child} />
                    ))}
                    <NewRow row={row} />
                </Fragment>
            )}
        </Fragment>
    );
}
