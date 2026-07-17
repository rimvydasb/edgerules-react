import type { ReactElement } from 'react';
import Chip from '@mui/material/Chip';
import type { PortableNode } from '@edgerules/portable';
import { typeLabel } from '../boxed-editor-utils';

export function BoxTypeChip({ schema }: { schema?: PortableNode }): ReactElement | null {
  const label = typeLabel(schema);
  return label ? <Chip size="small" label={label} /> : null;
}
