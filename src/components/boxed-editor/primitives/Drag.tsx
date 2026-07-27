import Box from '@mui/material/Box';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { ReactElement } from 'react';
import { CELL } from './layout';

/** Visual-only in this phase — drag behavior lands in Phase 6. */
export function Drag(): ReactElement {
  return (
    <Box
      aria-label="Drag to reorder row"
      sx={{
        display: 'flex',
        width: CELL,
        height: CELL,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRight: (theme) => `1px solid ${theme.palette.divider}`,
        bgcolor: 'action.hover',
      }}
    >
      <DragIndicatorIcon sx={{ fontSize: 19, color: 'text.secondary' }} />
    </Box>
  );
}
