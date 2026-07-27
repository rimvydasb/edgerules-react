import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactElement, ReactNode } from 'react';
import { CELL } from './layout';

export interface TallIconHandleProps {
  children: ReactNode;
  /** Set when the icon itself is the row's drag handle (e.g. `complexType`). */
  ariaLabel?: string;
  sx?: SxProps<Theme>;
}

/** Full-height (self-stretch) icon slot used by every tall (80 px) or icon-fronted row. */
export function TallIconHandle({
  children,
  ariaLabel,
  sx,
}: TallIconHandleProps): ReactElement {
  return (
    <Box
      aria-label={ariaLabel}
      sx={{
        display: 'flex',
        width: CELL,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'stretch',
        borderRight: (theme) => `1px solid ${theme.palette.divider}`,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
