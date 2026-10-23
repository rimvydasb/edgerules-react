import {SegmentedControl} from '@mantine/core';
import type {ReactElement} from 'react';
import type {ShellView} from './shell-types';

const VIEWS: {label: string; value: ShellView}[] = [
    {label: 'Code', value: 'code'},
    {label: 'Boxed', value: 'boxed'},
    {label: 'Flow', value: 'flow'},
];

export interface ShellViewSwitchProps {
    view: ShellView;
    onChange: (view: ShellView) => void;
}

/** Picks the editor of the Shell body; the root path stays. */
export function ShellViewSwitch({view, onChange}: ShellViewSwitchProps): ReactElement {
    return (
        <SegmentedControl
            size="xs"
            aria-label="View"
            data={VIEWS}
            value={view}
            onChange={(value) => onChange(value as ShellView)}
        />
    );
}
