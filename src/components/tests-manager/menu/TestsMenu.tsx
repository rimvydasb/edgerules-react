import {Menu} from '@mantine/core';
import type {ReactElement} from 'react';
import type {TestsMenuAction} from './actions';

// Shared menu for both the test-case column's and a row's three-dots buttons. `children` is the
// trigger element; the dropdown opens next to it and closes after an action runs.
export function TestsMenu({actions, children}: {actions: TestsMenuAction[]; children: ReactElement}): ReactElement {
    return (
        <Menu position="bottom-start" withinPortal>
            <Menu.Target>{children}</Menu.Target>
            <Menu.Dropdown>
                {actions.map((action) => (
                    <Menu.Item
                        key={action.label}
                        disabled={action.disabled}
                        leftSection={action.icon}
                        onClick={action.onSelect}
                    >
                        {action.label}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
}
