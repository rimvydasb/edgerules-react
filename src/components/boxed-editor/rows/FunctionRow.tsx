import FunctionsIcon from '@mui/icons-material/Functions';
import {Fragment, type ReactElement} from 'react';
import type {BoxedRowData, BoxedTableRowData} from '../boxed-editor-types';
import {moveArgument, renameArgument, retypeArgument} from '../commands/rowFactories';
import {useRowCommands} from '../commands/useRowCommands';
import {useBoxedEditorUi} from '../context/BoxedEditorUiContext';
import {useRowActions} from '../hooks/useRowActions';
import {ArgumentHeaders} from '../primitives';
import {FunctionResultRow} from './FunctionResultRow';
import {GenericRow} from './GenericRow';
import {NewRow} from './NewRow';
import {RowSwitch} from './RowSwitch';

export interface FunctionRowProps {
    row: BoxedTableRowData;
}

/** Named callable (`func`) — tall header row with its argument headers, then its body rows. */
export function FunctionRow({row}: FunctionRowProps): ReactElement {
    const {isExpanded} = useBoxedEditorUi();
    const expanded = isExpanded(row.path);
    const actions = useRowActions(row);
    const commands = useRowCommands();
    const commit = (next: BoxedTableRowData): string | undefined =>
        commands.setBoxedRowData(row.path, next, row.path)?.message;
    const rename = (from: string, to: string): string | undefined => {
        if (to !== from && row.parameters?.some((parameter) => parameter.name === to)) {
            return `An argument named "${to}" already exists.`;
        }
        return commit(renameArgument(row, from, to));
    };

    return (
        <Fragment>
            <GenericRow
                row={row}
                name={row.name}
                type={row.type}
                depth={row.depth}
                tall
                strong
                iconActsAsDragHandle
                icon={<FunctionsIcon sx={{fontSize: 19, color: '#fff'}} />}
                iconBgColor="#1976d2"
                value={
                    <ArgumentHeaders
                        rowPath={row.path}
                        arguments={row.parameters ?? []}
                        onRename={rename}
                        onRetype={(name, type) => commit(retypeArgument(row, name, type))}
                        onMove={(from, to) => {
                            commit(moveArgument(row, from, to));
                        }}
                    />
                }
                valueIsInteractive
                actions={actions}
            />
            {expanded && (
                <Fragment>
                    {row.children?.map((child) => renderChild(child, row))}
                    <NewRow row={row} />
                </Fragment>
            )}
        </Fragment>
    );
}

function renderChild(child: BoxedRowData, functionRow: BoxedTableRowData): ReactElement {
    if (child.kind === 'function-result') {
        return <FunctionResultRow key={child.path} row={child} functionRow={functionRow} />;
    }
    return <RowSwitch key={child.path} row={child} />;
}
