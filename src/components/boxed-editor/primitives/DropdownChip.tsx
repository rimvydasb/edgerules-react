import Box from '@mui/material/Box';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import type {ReactElement, ReactNode} from 'react';

export interface DropdownChipProps {
    children: ReactNode;
    iconColor?: string;
}

/**
 * Picklist-style chip for a single-value setting (hit policy, solver backend, ...) that opens a
 * dropdown in the real editor. Introduced now for the shared primitive set; first consumed by
 * `ruleset-hit-policy` / `optimisation-setting` rows in Phase 4.
 */
export function DropdownChip({children, iconColor}: DropdownChipProps): ReactElement {
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
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
    );
}
