import Box from '@mui/material/Box';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { MouseEvent, ReactElement } from 'react';
import { ACTIONS_COLUMN_WIDTH, ROW_HEIGHT, TALL_ROW_HEIGHT } from './layout';

export interface RowActionsButtonProps {
  tall?: boolean;
  /** Menu wiring lands in Phase 5 — this button is visual-only until then. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/** The vertical three-dot context-menu button, one `ActionsColumn` cell wide. */
export function RowActionsButton({
  tall = false,
  onClick,
}: RowActionsButtonProps): ReactElement {
  return (
    <Box
      component="button"
      type="button"
      aria-label="Open row actions"
      onClick={onClick}
      sx={{
        display: 'flex',
        width: ACTIONS_COLUMN_WIDTH,
        height: tall ? TALL_ROW_HEIGHT : ROW_HEIGHT,
        alignSelf: 'stretch',
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        p: 0,
        border: 'none',
        borderRight: (theme) => `1px solid ${theme.palette.divider}`,
        bgcolor: 'action.hover',
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.selected' },
      }}
    >
      <MoreVertIcon sx={{ fontSize: 21, color: 'text.secondary' }} />
    </Box>
  );
}
