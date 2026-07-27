import Box from '@mui/material/Box';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import { RowActionsMenu, type RowMenuItem } from '../menu/RowActionsMenu';
import { useRowMenu } from '../menu/useRowMenu';
import {
  ACTIONS_COLUMN_WIDTH,
  Cell,
  CELL,
  Drag,
  gridTemplateColumns,
  RowActionsButton,
  RowLine,
  ROW_HEIGHT,
  TALL_ROW_HEIGHT,
  TallIconHandle,
  TypeName,
} from '../primitives';

// `Row` is the generic leaf row every `BoxedRowKind` in this phase (and most of the rest)
// reduces to once laid out — only `kind`-driven display flags change between them (which the
// row-kind components in this folder supply). Higher-level constructs (function/ruleset/
// optimisation header rows, Phase 4) may still compose it for their name/icon column.

export interface GenericRowProps {
  name: ReactNode;
  value?: ReactNode;
  type?: string;
  depth: number;
  icon?: ReactNode;
  iconBgColor?: string;
  /** The icon is this row's own drag handle (e.g. `complexType`) — no separate `Drag` cell. */
  iconActsAsDragHandle?: boolean;
  /** `false` for fixed/non-sortable rows (`model`). */
  showDragHandle?: boolean;
  occupiesNameAndValue?: boolean;
  strong?: boolean;
  placeholder?: boolean;
  tall?: boolean;
  /** Skips the ellipsis-text wrapper around `value` — pass true when `value` renders its own
   * layout (e.g. `ExpressionCell`, which swaps between static text and a full-width editor). */
  valueIsInteractive?: boolean;
  /** `false` suppresses the three-dot menu button — the trailing `NewRow` placeholder has no
   * actions of its own; an empty `ActionsColumn`-width cell fills the gap instead. */
  showActions?: boolean;
  /** The row's own menu items (`useRowActions`). No button renders when empty, regardless of
   * `showActions` (e.g. `ruleset-hit-policy`, or any row whose only actions were filtered out
   * under `readOnly`). */
  actions?: RowMenuItem[];
  /** Makes the whole row respond to click/Enter/Space — used by the trailing `NewRow`
   * placeholder to append without opening a menu. */
  onActivate?: () => void;
}

export function GenericRow({
  name,
  value,
  type,
  depth,
  icon,
  iconBgColor,
  iconActsAsDragHandle = false,
  showDragHandle = true,
  occupiesNameAndValue = false,
  strong = false,
  placeholder = false,
  tall = false,
  valueIsInteractive = false,
  showActions = true,
  actions = [],
  onActivate,
}: GenericRowProps): ReactElement {
  const { showDescription, showTestResults, showType } = useBoxedEditorContext();
  const menu = useRowMenu();
  const height = tall ? TALL_ROW_HEIGHT : ROW_HEIGHT;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!onActivate) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  return (
    <Box
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={onActivate ? handleKeyDown : undefined}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: gridTemplateColumns({ showDescription, showTestResults }),
        height,
        bgcolor: 'background.paper',
        cursor: onActivate ? 'pointer' : undefined,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          minWidth: 0,
          alignItems: 'center',
          borderRight: (theme) => `1px solid ${theme.palette.divider}`,
          bgcolor: 'action.hover',
          gridColumn: occupiesNameAndValue ? 'span 2' : undefined,
        }}
      >
        {Array.from({ length: depth }, (_, index) => (
          <Box
            key={index}
            aria-hidden="true"
            sx={{
              width: CELL,
              height: CELL,
              flexShrink: 0,
              borderRight: (theme) => `1px solid ${theme.palette.divider}`,
            }}
          />
        ))}
        {showDragHandle && !iconActsAsDragHandle && <Drag />}
        {icon && (
          <TallIconHandle
            ariaLabel={iconActsAsDragHandle ? 'Drag to reorder row' : undefined}
            sx={{ bgcolor: iconBgColor }}
          >
            {icon}
          </TallIconHandle>
        )}
        <TypeName
          type={showType ? type : undefined}
          sx={{
            px: 1,
            fontWeight: strong ? 600 : 400,
            fontStyle: placeholder ? 'italic' : 'normal',
            color: placeholder ? 'text.disabled' : 'text.primary',
          }}
        >
          {name}
        </TypeName>
      </Box>
      {!occupiesNameAndValue && (
        <Cell>
          {valueIsInteractive ? (
            value
          ) : (
            <Box
              component="span"
              sx={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontStyle: placeholder ? 'italic' : 'normal',
                color: placeholder ? 'text.disabled' : 'inherit',
              }}
            >
              {value}
            </Box>
          )}
        </Cell>
      )}
      {showActions && actions.length > 0 ? (
        <>
          <RowActionsButton tall={tall} onClick={menu.open} />
          <RowActionsMenu items={actions} anchorEl={menu.anchorEl} onClose={menu.close} />
        </>
      ) : (
        <Box
          aria-hidden="true"
          sx={{
            width: ACTIONS_COLUMN_WIDTH,
            height,
            flexShrink: 0,
            borderRight: (theme) => `1px solid ${theme.palette.divider}`,
            bgcolor: 'action.hover',
          }}
        />
      )}
      {showDescription && <Cell column="description" />}
      {showTestResults && <Cell column="test-results" />}
      <RowLine />
    </Box>
  );
}
