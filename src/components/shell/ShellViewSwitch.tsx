import {IconCode, IconFlask, IconSchema, IconTable, type Icon} from '@tabler/icons-react';
import type {KeyboardEvent, ReactElement} from 'react';
import {cx} from '#ui/cx';
import type {ShellView} from './shell-types';
import * as classes from './shell.module.css';

type EditorView = Exclude<ShellView, 'tests'>;

const VIEWS: {label: string; value: EditorView; icon: Icon}[] = [
    {label: 'Code', value: 'code', icon: IconCode},
    {label: 'Boxed', value: 'boxed', icon: IconTable},
    {label: 'Flow', value: 'flow', icon: IconSchema},
];

export interface ShellViewSwitchProps {
    view: ShellView;
    onChange: (view: ShellView) => void;
    flowDisabled?: boolean; // the root path has no Flow view: a ruleset, a type or a plain field
}

/**
 * Picks the editor of the Shell body; the root path stays. One header cell per view, like a radio group. The Tests
 * view has no other view, so it shows one fixed cell instead.
 */
export function ShellViewSwitch({view, onChange, flowDisabled}: ShellViewSwitchProps): ReactElement {
    if (view === 'tests') {
        return (
            <div className={classes.viewSwitch}>
                <span className={cx(classes.viewButton, classes.viewButtonActive)} data-testid="shell-tests-view">
                    <IconFlask aria-hidden="true" size={16} />
                    Tests
                </span>
            </div>
        );
    }
    const views = VIEWS.filter((item) => !(flowDisabled && item.value === 'flow'));
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
        const index = views.findIndex((item) => item.value === view);
        const next = views[(index + step + views.length) % views.length]!;
        onChange(next.value);
        event.currentTarget.querySelector<HTMLElement>(`[data-view="${next.value}"]`)?.focus();
    };
    return (
        <div role="radiogroup" aria-label="View" className={classes.viewSwitch} onKeyDown={onKeyDown}>
            {VIEWS.map(({label, value, icon: ViewIcon}) => {
                const checked = value === view;
                const disabled = flowDisabled && value === 'flow';
                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={disabled}
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
