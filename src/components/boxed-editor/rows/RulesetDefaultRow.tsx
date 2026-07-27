import Box from '@mui/material/Box';
import type { ReactElement } from 'react';
import type { BoxedTableRowData } from '../boxed-editor-types';
import { ExpressionCell } from '../cells/ExpressionCell';
import { useRowCommands } from '../commands/useRowCommands';
import { useRowActions } from '../hooks/useRowActions';
import { SettingRow } from '../primitives';
import { childPath } from '../service/portable-utils';

export interface RulesetDefaultRowProps {
  row: BoxedTableRowData;
}

/** Singleton fallback row shown when no rule matches — fixed, not draggable, not duplicable. */
export function RulesetDefaultRow({ row }: RulesetDefaultRowProps): ReactElement {
  const commands = useRowCommands();
  const actions = useRowActions(row);
  const actionColumns = row.actionColumns ?? [];

  const commitAction = (index: number, value: string) => {
    const actions = actionColumns.map((_, i) => (i === index ? value : (row.actions?.[i] ?? '')));
    const updated: BoxedTableRowData = { ...row, actions };
    return commands.setBoxedRowData(row.path, updated);
  };

  return (
    <SettingRow name={row.name} depth={row.depth} showActions actions={actions}>
      <Box sx={{ display: 'flex', width: '100%', height: '100%' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flex: 1,
            minWidth: 0,
            px: 1,
            fontStyle: 'italic',
            color: 'text.disabled',
          }}
        >
          otherwise
        </Box>
        {actionColumns.map((column, index) => (
          <Box
            key={column}
            sx={{
              display: 'flex',
              alignItems: 'center',
              flex: 1,
              minWidth: 0,
              px: 1,
              borderLeft: (theme) =>
                `${index === 0 ? 2 : 1}px solid ${theme.palette.divider}`,
            }}
          >
            <ExpressionCell
              row={{
                kind: 'field',
                depth: row.depth,
                path: childPath(row.path, column),
                name: column,
                value: row.actions?.[index] ?? '',
              }}
              onCommit={(value) => commitAction(index, value)}
            />
          </Box>
        ))}
      </Box>
    </SettingRow>
  );
}
