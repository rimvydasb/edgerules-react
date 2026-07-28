import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type {ReactElement} from 'react';
import type {TestsMenuAction} from './actions';

// Shared MUI menu for both the test-case column's and a row's three-dots buttons.
export function TestsMenu({
    anchorEl,
    onClose,
    actions,
}: {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    actions: TestsMenuAction[];
}): ReactElement {
    return (
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
            {actions.map((action) => (
                <MenuItem
                    key={action.label}
                    disabled={action.disabled}
                    onClick={() => {
                        action.onSelect();
                        onClose();
                    }}
                >
                    {action.icon && <ListItemIcon>{action.icon}</ListItemIcon>}
                    {action.label}
                </MenuItem>
            ))}
        </Menu>
    );
}
