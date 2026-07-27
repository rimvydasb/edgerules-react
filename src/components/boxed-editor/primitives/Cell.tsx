import Box from '@mui/material/Box';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';
import type { CSSObject } from '@mui/system';
import type { ReactElement, ReactNode } from 'react';
import type { BoxedColumn } from './layout';

export interface CellProps {
  children?: ReactNode;
  column?: BoxedColumn;
  sx?: SxProps<Theme>;
}

const columnSx: Record<BoxedColumn, (theme: Theme) => CSSObject> = {
  value: () => ({}),
  description: (theme) => ({
    backgroundColor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.08 : 0.05),
    fontFamily: theme.typography.fontFamily,
    fontSize: '0.8125rem',
    fontStyle: 'italic',
    color: theme.palette.text.secondary,
  }),
  'test-results': (theme) => ({
    backgroundColor: alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.08 : 0.05),
    fontFamily: theme.typography.fontFamily,
    fontSize: '0.8125rem',
    borderRight: 'none',
  }),
};

export function Cell({ children, column = 'value', sx }: CellProps): ReactElement {
  return (
    <Box
      data-column={column}
      sx={[
        {
          display: 'flex',
          minWidth: 0,
          alignItems: 'center',
          borderRight: (theme) => `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
          px: 1,
        },
        columnSx[column],
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
