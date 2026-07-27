import Box from '@mui/material/Box';
import type { ReactElement, ReactNode } from 'react';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import {
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
}: GenericRowProps): ReactElement {
  const { showDescription, showTestResults, showType } = useBoxedEditorContext();
  const height = tall ? TALL_ROW_HEIGHT : ROW_HEIGHT;

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: gridTemplateColumns({ showDescription, showTestResults }),
        height,
        bgcolor: 'background.paper',
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
      <RowActionsButton tall={tall} />
      {showDescription && <Cell column="description" />}
      {showTestResults && <Cell column="test-results" />}
      <RowLine />
    </Box>
  );
}
