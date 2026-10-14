import {Menu} from '@mantine/core';
import {IconCaretDownFilled} from '@tabler/icons-react';
import {useState, type ReactElement, type ReactNode} from 'react';
import * as classes from '../boxedEditor.module.css';

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
export function DropdownChip({children, iconColor, options, onChange, ariaLabel}: DropdownChipProps): ReactElement {
    const [opened, setOpened] = useState(false);
    return (
        <Menu opened={opened} onChange={setOpened} position="bottom-start" withinPortal>
            <Menu.Target>
                <button
                    type="button"
                    aria-label={ariaLabel}
                    aria-haspopup="menu"
                    className={classes.chip}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            setOpened(true);
                        }
                    }}
                >
                    {children}
                    <IconCaretDownFilled size={12} color={iconColor} />
                </button>
            </Menu.Target>
            <Menu.Dropdown>
                {options.map((option) => (
                    <Menu.Item
                        key={option}
                        data-selected={option === children || undefined}
                        onClick={() => onChange(option)}
                    >
                        {option}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
}
