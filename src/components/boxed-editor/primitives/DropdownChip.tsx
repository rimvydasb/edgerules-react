import Box from '@mui/material/Box';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import {useState, type KeyboardEvent, type MouseEvent} from 'react';
import type {ReactElement, ReactNode} from 'react';

export interface DropdownChipProps {
    children: ReactNode;
    iconColor?: string;
    options: readonly string[];
    onChange: (value: string) => void;
    ariaLabel?: string;
}

/**
 * Picklist-style chip for a single-value setting (hit policy, solver backend, ...) that opens a
 * dropdown in the real editor. Introduced now for the shared primitive set; first consumed by
 * `ruleset-hit-policy` / `optimisation-setting` rows in Phase 4.
 */
export function DropdownChip({
    children,
    iconColor,
    options,
    onChange,
    ariaLabel,
}: DropdownChipProps): ReactElement {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const open = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): void => {
        setAnchor(event.currentTarget);
    };
    return (
        <>
            <Box
                component="button"
                type="button"
                aria-label={ariaLabel}
                aria-haspopup="menu"
                aria-expanded={Boolean(anchor)}
                onClick={open}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        open(event);
                    }
                }}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    border: 0,
                    color: 'inherit',
                    bgcolor: 'transparent',
                    cursor: 'pointer',
                    borderRadius: 1,
                    py: 0.25,
                    pl: 1,
                    pr: 0.5,
                    fontSize: '0.75rem',
                }}
            >
                {children}
                <ArrowDropDownIcon sx={{fontSize: 18, color: iconColor}} />
            </Box>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
                {options.map((option) => (
                    <MenuItem
                        key={option}
                        selected={option === children}
                        onClick={() => {
                            setAnchor(null);
                            onChange(option);
                        }}
                    >
                        {option}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}
