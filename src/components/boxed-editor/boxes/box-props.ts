import type { ReactNode } from 'react';

export interface BoxPresentationProps {
  depth: number;
  actions?: ReactNode;
  suppressFieldActions?: boolean;
  suppressMetadata?: boolean;
}
