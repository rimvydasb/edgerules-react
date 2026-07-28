import Box from '@mui/material/Box';
import type { ReactElement } from 'react';
import type { PortableError } from '@edgerules/portable';
import type { BoxedTableRowData } from '../boxed-editor-types';
import { ExpressionCell } from '../cells/ExpressionCell';
import { useRowCommands } from '../commands/useRowCommands';
import { useRowActions } from '../hooks/useRowActions';
import { childPath } from '../service/portable-utils';
import { GenericRow } from './GenericRow';

export interface RuleRowProps {
  row: BoxedTableRowData;
  /** Whether the owning ruleset's `hitPolicy` is `"best-match"` — the only policy under which
   * `priority` is authored (required there, rejected elsewhere per `RULESETS_REFERENCE.md`). */
  showPriority?: boolean;
}

/**
 * One row of a `rule`'s condition/action matrix. Every cell commit rewrites and commits the
 * *whole* `rule` row (Section 7) rather than a synthetic per-cell leaf path — `denormalize`'s
 * `ruleNode` already implements "blank condition cell omits the key" (= "any") on that rewrite.
 */
function RuleCells({ row, showPriority }: { row: BoxedTableRowData; showPriority: boolean }): ReactElement {
  const commands = useRowCommands();
  const conditionColumns = row.conditionColumns ?? [];
  const actionColumns = row.actionColumns ?? [];
  const conditionWeight = conditionColumns.length || 1;
  const actionWeight = actionColumns.length || 1;
  const hasExpression = row.conditionsExpression !== undefined;

  const commitConditionCell = (index: number, value: string): PortableError | undefined => {
    const conditions = conditionColumns.map((_, i) => (i === index ? value : (row.conditions?.[i] ?? '')));
    const updated: BoxedTableRowData = { ...row, conditions, conditionsExpression: undefined };
    return commands.setBoxedRowData(row.path, updated);
  };
  const commitConditionsExpression = (value: string): PortableError | undefined => {
    const updated: BoxedTableRowData = { ...row, conditionsExpression: value, conditions: undefined };
    return commands.setBoxedRowData(row.path, updated);
  };
  const commitActionCell = (index: number, value: string): PortableError | undefined => {
    const actions = actionColumns.map((_, i) => (i === index ? value : (row.actions?.[i] ?? '')));
    const updated: BoxedTableRowData = { ...row, actions };
    return commands.setBoxedRowData(row.path, updated);
  };
  const commitPriority = (value: string): PortableError | undefined => {
    const priority = Number(value);
    if (!Number.isFinite(priority)) {
      return {
        '@kind': 'error',
        type: 'Parse',
        message: 'Priority must be a whole number',
        path: row.path,
      };
    }
    const updated: BoxedTableRowData = { ...row, priority };
    return commands.setBoxedRowData(row.path, updated);
  };

  return (
    <Box sx={{ display: 'flex', width: '100%', height: '100%' }}>
      {hasExpression ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flex: conditionWeight,
            minWidth: 0,
            px: 1,
            borderRight: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <ExpressionCell
            row={{
              kind: 'field',
              depth: row.depth,
              path: childPath(row.path, 'when'),
              name: 'when',
              value: row.conditionsExpression ?? '',
            }}
            onCommit={commitConditionsExpression}
          />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flex: conditionWeight, minWidth: 0 }}>
          {conditionColumns.map((column, index) => (
            <Box
              key={column}
              sx={{
                display: 'flex',
                alignItems: 'center',
                flex: 1,
                minWidth: 0,
                px: 1,
                borderRight: (theme) => `1px solid ${theme.palette.divider}`,
                '&:last-of-type': { borderRight: 'none' },
              }}
            >
              <ExpressionCell
                row={{
                  kind: 'field',
                  depth: row.depth,
                  path: childPath(row.path, `when.${column}`),
                  name: column,
                  value: row.conditions?.[index] ?? '',
                }}
                onCommit={(value) => commitConditionCell(index, value)}
              />
            </Box>
          ))}
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          flex: actionWeight,
          minWidth: 0,
          borderLeft: (theme) => `2px solid ${theme.palette.divider}`,
        }}
      >
        {actionColumns.map((column, index) => (
          <Box
            key={column}
            sx={{
              display: 'flex',
              alignItems: 'center',
              flex: 1,
              minWidth: 0,
              px: 1,
              borderRight: (theme) => `1px solid ${theme.palette.divider}`,
              '&:last-of-type': { borderRight: 'none' },
            }}
          >
            <ExpressionCell
              row={{
                kind: 'field',
                depth: row.depth,
                path: childPath(row.path, `then.${column}`),
                name: column,
                value: row.actions?.[index] ?? '',
              }}
              onCommit={(value) => commitActionCell(index, value)}
            />
          </Box>
        ))}
      </Box>
      {showPriority && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flex: 1,
            minWidth: 0,
            px: 1,
            borderLeft: (theme) => `2px solid ${theme.palette.divider}`,
          }}
        >
          <ExpressionCell
            row={{
              kind: 'field',
              depth: row.depth,
              path: childPath(row.path, 'priority'),
              name: 'priority',
              value: row.priority !== undefined ? String(row.priority) : '',
            }}
            onCommit={commitPriority}
          />
        </Box>
      )}
    </Box>
  );
}

/** One row of a decision table's rule matrix — draggable, `Duplicate`/`Delete` menu actions. */
export function RuleRow({ row, showPriority = false }: RuleRowProps): ReactElement {
  const actions = useRowActions(row);
  return (
    <GenericRow
      row={row}
      name={row.name}
      depth={row.depth}
      value={<RuleCells row={row} showPriority={showPriority} />}
      valueIsInteractive
      actions={actions}
    />
  );
}
