import MultilineChartIcon from '@mui/icons-material/MultilineChart';
import {Fragment, type ReactElement} from 'react';
import type {BoxedRowData, BoxedTableRowData} from '../boxed-editor-types';
import {moveArgument, renameArgument, retypeArgument} from '../commands/rowFactories';
import {useRowCommands} from '../commands/useRowCommands';
import {useBoxedEditorUi} from '../context/BoxedEditorUiContext';
import {useRowActions} from '../hooks/useRowActions';
import {ArgumentHeaders} from '../primitives';
import {GenericRow} from './GenericRow';
import {OptimisationConstraintGroupRow} from './OptimisationConstraintGroupRow';
import {OptimisationObjectiveRow} from './OptimisationObjectiveRow';
import {OptimisationSettingRow} from './OptimisationSettingRow';
import {OptimisationVariableGroupRow} from './OptimisationVariableGroupRow';

export interface OptimisationRowProps {
    row: BoxedTableRowData;
}

/**
 * A named linear optimisation problem (`optimise`) — tall header row with its argument headers,
 * then its fixed `using` / `bottlenecks` / `variables` / objective / `constraints` / `timeLimit`
 * children, rendered in the order the service returns them (never re-sorted here). `optimise` has
 * no standalone editor elsewhere — this inline tree is its only GUI.
 */
export function OptimisationRow({row}: OptimisationRowProps): ReactElement {
    const {isExpanded} = useBoxedEditorUi();
    const expanded = isExpanded(row.path);
    const actions = useRowActions(row);
    const commands = useRowCommands();
    const commit = (next: BoxedTableRowData): string | undefined =>
        commands.setBoxedRowData(row.path, next, row.path)?.message;

    return (
        <Fragment>
            <GenericRow
                row={row}
                name={row.name}
                depth={row.depth}
                tall
                strong
                iconActsAsDragHandle
                icon={<MultilineChartIcon sx={{fontSize: 19, color: '#fff'}} />}
                iconBgColor="#1e88e5"
                value={
                    <ArgumentHeaders
                        rowPath={row.path}
                        arguments={row.parameters ?? []}
                        onRename={(from, to) => {
                            if (to !== from && row.parameters?.some((parameter) => parameter.name === to)) {
                                return `An argument named "${to}" already exists.`;
                            }
                            return commit(renameArgument(row, from, to));
                        }}
                        onRetype={(name, type) => commit(retypeArgument(row, name, type))}
                        onMove={(from, to) => {
                            commit(moveArgument(row, from, to));
                        }}
                    />
                }
                valueIsInteractive
                actions={actions}
            />
            {expanded && row.children?.map((child) => renderChild(child))}
        </Fragment>
    );
}

function renderChild(child: BoxedRowData): ReactElement | null {
    switch (child.kind) {
        case 'optimisation-setting':
            return <OptimisationSettingRow key={child.path} row={child} />;
        case 'optimisation-variable-group':
            return <OptimisationVariableGroupRow key={child.path} row={child} />;
        case 'optimisation-objective':
            return <OptimisationObjectiveRow key={child.path} row={child} />;
        case 'optimisation-constraint-group':
            return <OptimisationConstraintGroupRow key={child.path} row={child} />;
        default:
            return null;
    }
}
