import Box from '@mui/material/Box';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { ReactElement } from 'react';
import { CELL } from './layout';

/** Compact drag affordance for a header cell inside `ArgumentHeaders` (Phase 4+). */
export function ColumnDragHandle(): ReactElement {
  return (
    <Box
      aria-label="Drag to reorder column"
      sx={{
        display: 'flex',
        width: 24,
        height: CELL,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
      }}
    >
      <DragIndicatorIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
    </Box>
  );
}
