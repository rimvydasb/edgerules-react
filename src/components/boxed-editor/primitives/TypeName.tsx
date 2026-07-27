import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import type { SxProps, Theme } from '@mui/material/styles';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useAltHeld } from '../hooks/useAltHeld';

export interface TypeNameProps {
  /** Undefined suppresses the tooltip entirely — used to honour `showType={false}`. */
  type?: string;
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Every construct's type lives in a tooltip on its owning name/header cell: hover opens just
 * that one tooltip, holding Alt anywhere opens every `TypeName` tooltip in the tree at once
 * (Resolved Decision #9).
 */
export function TypeName({ type, children, sx }: TypeNameProps): ReactElement {
  const altHeld = useAltHeld();
  const [hovered, setHovered] = useState(false);
  const span = (
    <Box
      component="span"
      sx={{
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
  if (!type) return span;
  return (
    <Tooltip
      describeChild
      title={type}
      arrow
      open={hovered || altHeld}
      onOpen={() => setHovered(true)}
      onClose={() => setHovered(false)}
    >
      {span}
    </Tooltip>
  );
}
