import {Menu} from '@mantine/core';
import {Fragment, type ReactElement} from 'react';
import type {Icon} from '@tabler/icons-react';

export interface RowMenuItem {
    id: string;
    label: string;
    icon?: Icon;
    danger?: boolean;
    onSelect: () => void;
}

export interface RowActionsMenuProps {
    items: RowMenuItem[];
    /** The trigger element (a `RowActionsButton`); the menu opens beneath it, right-aligned. */
    children: ReactElement;
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
export function RowActionsMenu({items, children}: RowActionsMenuProps): ReactElement {
    const dangerStart = trailingDangerStart(items);
    return (
        <Menu position="bottom-end" width={220} withinPortal>
            <Menu.Target>{children}</Menu.Target>
            <Menu.Dropdown>
                {items.map((item, index) => (
                    <Fragment key={`${item.id}-${index}`}>
                        {index === dangerStart && dangerStart > 0 && <Menu.Divider />}
                        <Menu.Item
                            color={item.danger ? 'red' : undefined}
                            leftSection={item.icon ? <item.icon size={16} /> : undefined}
                            onClick={item.onSelect}
                        >
                            {item.label}
                        </Menu.Item>
                    </Fragment>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
}
