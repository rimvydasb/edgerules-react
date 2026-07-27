import Box from '@mui/material/Box';
import type { ReactElement } from 'react';

/** Bottom border rendered above adjoining cell borders so row separators never double up. */
export function RowLine(): ReactElement {
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'absolute',
        insetInline: 0,
        bottom: 0,
        height: '1px',
        bgcolor: 'divider',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
}
