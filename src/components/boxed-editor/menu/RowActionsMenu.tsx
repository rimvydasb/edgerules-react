import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Fragment, type ReactElement } from 'react';
import type { SvgIconComponent } from '@mui/icons-material';

export interface RowMenuItem {
  id: string;
  label: string;
  icon?: SvgIconComponent;
  danger?: boolean;
  onSelect: () => void;
}

export interface RowActionsMenuProps {
  items: RowMenuItem[];
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

// A trailing run of danger actions (e.g. per-instance deletes followed by the row's own delete)
// reads as one "destructive" group, set off from the rest of the menu by a divider placed just
// above where that run begins.
function trailingDangerStart(items: RowMenuItem[]): number {
  let start = items.length;
  while (start > 0 && items[start - 1].danger) start -= 1;
  return start;
}

/** The three-dot menu opened by every row's `RowActionsButton` — items come from `useRowActions`. */
export function RowActionsMenu({ items, anchorEl, onClose }: RowActionsMenuProps): ReactElement {
  const dangerStart = trailingDangerStart(items);
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { minWidth: 220 } } }}
    >
      {items.map((item, index) => (
        <Fragment key={`${item.id}-${index}`}>
          {index === dangerStart && dangerStart > 0 && <Divider sx={{ my: 0.5 }} />}
          <MenuItem
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            sx={{ fontSize: 13, color: item.danger ? 'error.main' : undefined }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              {item.icon && (
                <item.icon
                  fontSize="small"
                  sx={{ color: item.danger ? 'error.main' : 'text.secondary' }}
                />
              )}
            </ListItemIcon>
            {item.label}
          </MenuItem>
        </Fragment>
      ))}
    </Menu>
  );
}
