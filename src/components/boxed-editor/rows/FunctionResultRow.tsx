import type {ReactElement} from 'react';
import type {PortableError} from '@edgerules/portable';
import type {BoxedRowData, BoxedTableRowData} from '../boxed-editor-types';
import {ExpressionCell} from '../cells/ExpressionCell';
import {useRowCommands} from '../commands/useRowCommands';
import {useRowActions} from '../hooks/useRowActions';
import {GenericRow} from './GenericRow';

export interface FunctionResultRowProps {
    row: BoxedRowData;
    /**
     * The owning `function` row, when known (`FunctionRow` renders this kind directly rather than
     * through `RowSwitch`, precisely to supply it). An inline function's body is a bare expression
     * in the AST — `<name>.result` names no real field there, so `set("<name>.result", ...)` is
     * rejected (`WrongFieldPath`); the commit has to rewrite the *whole* `function` row instead,
     * the same "container edits rewrite the whole parent" rule Section 7 applies to rule/optimise
     * children. Falling back to the default per-path commit (no `functionRow`) only matters for a
     * `BoxedEditor` pointed directly at a result's own path — a rarer case left unhandled here.
     */
    functionRow?: BoxedTableRowData;
}

/** The synthesized `result` line of a function body — always present, not draggable. */
export function FunctionResultRow({row, functionRow}: FunctionResultRowProps): ReactElement {
    const commands = useRowCommands();
    const actions = useRowActions(row);

    const onCommit = functionRow
        ? (value: string): PortableError | undefined => {
              const updated: BoxedTableRowData = {...functionRow, children: [{...row, value}]};
              return commands.setBoxedRowData(functionRow.path, updated);
          }
        : undefined;

    return (
        <GenericRow
            row={row}
            name={row.name}
            value={<ExpressionCell row={row} onCommit={onCommit} />}
            valueIsInteractive
            type={row.type}
            depth={row.depth}
            showDragHandle={false}
            actions={actions}
        />
    );
}
