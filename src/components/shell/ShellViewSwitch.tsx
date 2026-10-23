import {IconCode, IconSchema, IconTable, type Icon} from '@tabler/icons-react';
import type {KeyboardEvent, ReactElement} from 'react';
import {cx} from '#ui/cx';
import type {ShellView} from './shell-types';
import * as classes from './shell.module.css';

const VIEWS: {label: string; value: ShellView; icon: Icon}[] = [
    {label: 'Code', value: 'code', icon: IconCode},
    {label: 'Boxed', value: 'boxed', icon: IconTable},
    {label: 'Flow', value: 'flow', icon: IconSchema},
];

export interface ShellViewSwitchProps {
    view: ShellView;
    onChange: (view: ShellView) => void;
}

/** Picks the editor of the Shell body; the root path stays. One header cell per view, like a radio group. */
export function ShellViewSwitch({view, onChange}: ShellViewSwitchProps): ReactElement {
    // Arrow keys move the selection, as in a native radio group.
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step =
            event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? 1
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? -1
                  : 0;
        if (step === 0) return;
        event.preventDefault();
        const index = VIEWS.findIndex((item) => item.value === view);
        const next = VIEWS[(index + step + VIEWS.length) % VIEWS.length]!;
        onChange(next.value);
        event.currentTarget.querySelector<HTMLElement>(`[data-view="${next.value}"]`)?.focus();
    };
    return (
        <div role="radiogroup" aria-label="View" className={classes.viewSwitch} onKeyDown={onKeyDown}>
            {VIEWS.map(({label, value, icon: ViewIcon}) => {
                const checked = value === view;
                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={checked ? 0 : -1}
                        data-view={value}
                        className={cx(classes.viewButton, checked && classes.viewButtonActive)}
                        onClick={() => onChange(value)}
                    >
                        <ViewIcon aria-hidden="true" size={16} />
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
