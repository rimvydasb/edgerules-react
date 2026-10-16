import {Menu, Tooltip} from '@mantine/core';
import {Fragment, useEffect, useRef, useState, type ReactElement, type ReactNode} from 'react';
import type {Icon} from '@tabler/icons-react';

export interface RowMenuItem {
    id: string;
    label: string;
    icon?: Icon;
    danger?: boolean;
    onSelect: () => void;
    /** Label of the group this item starts; consecutive items share a group until the next label. */
    group?: ReactNode;
    /** The item is shown but cannot run; `reason` explains why in a tooltip. */
    disabled?: boolean;
    reason?: string;
}

export interface RowActionsMenuProps {
    items: RowMenuItem[];
    /** The trigger element (a `RowActionsButton`); the menu opens beneath it, right-aligned. */
    children: ReactElement;
    /** Muted text under the last item. */
    footer?: ReactNode;
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
export function RowActionsMenu({items, children, footer}: RowActionsMenuProps): ReactElement {
    const dangerStart = trailingDangerStart(items);
    const [opened, setOpened] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Mantine's own click-outside listens on `document` in the bubble phase; canvases such as React Flow's
    // pane stop mousedown propagation (d3-zoom), so the menu would stay open. Listen in the capture phase.
    useEffect(() => {
        if (!opened) return;
        const onPointerDown = (event: Event) => {
            const target = event.target as Node | null;
            if (!(target instanceof Element)) return;
            // The open menu's own trigger toggles it through `onChange`.
            if (dropdownRef.current?.contains(target) || target.closest('[aria-haspopup="menu"][aria-expanded="true"]')) return;
            setOpened(false);
        };
        document.addEventListener('mousedown', onPointerDown, true);
        document.addEventListener('touchstart', onPointerDown, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown, true);
            document.removeEventListener('touchstart', onPointerDown, true);
        };
    }, [opened]);

    return (
        <Menu position="bottom-end" width={220} withinPortal opened={opened} onChange={setOpened}>
            <Menu.Target>{children}</Menu.Target>
            <Menu.Dropdown ref={dropdownRef}>
                {items.map((item, index) => (
                    <Fragment key={`${item.id}-${index}`}>
                        {item.group !== undefined && <Menu.Label>{item.group}</Menu.Label>}
                        {index === dangerStart && dangerStart > 0 && <Menu.Divider />}
                        <Tooltip
                            label={item.reason}
                            disabled={!item.disabled || !item.reason}
                            position="left"
                            withinPortal
                        >
                            <div>
                                <Menu.Item
                                    color={item.danger ? 'red' : undefined}
                                    leftSection={item.icon ? <item.icon size={16} /> : undefined}
                                    disabled={item.disabled}
                                    onClick={item.onSelect}
                                >
                                    {item.label}
                                </Menu.Item>
                            </div>
                        </Tooltip>
                    </Fragment>
                ))}
                {footer && (
                    <>
                        <Menu.Divider />
                        <Menu.Label>{footer}</Menu.Label>
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
}
