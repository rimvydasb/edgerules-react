import type {ReactElement} from 'react';
import {RowActionsMenu} from '#ui/RowActionsMenu';
import type {TestsMenuAction} from './actions';

// Shared menu for both the test-case column's and a row's three-dots buttons — the same
// `RowActionsMenu` the Boxed Editor and Flow Editor rows open, so every menu in the library looks
// alike. `children` is the trigger element.
export function TestsMenu({actions, children}: {actions: TestsMenuAction[]; children: ReactElement}): ReactElement {
    return <RowActionsMenu items={actions.map((action) => ({id: action.label, ...action}))}>{children}</RowActionsMenu>;
}
