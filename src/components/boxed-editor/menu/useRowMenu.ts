import { useCallback, useState, type MouseEvent } from 'react';

export interface RowMenuState {
  anchorEl: HTMLElement | null;
  open: (event: MouseEvent<HTMLElement>) => void;
  close: () => void;
}

/** Open/close + anchor handling shared by every row's three-dot `RowActionsMenu`. */
export function useRowMenu(): RowMenuState {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);
  const close = useCallback(() => setAnchorEl(null), []);
  return { anchorEl, open, close };
}
