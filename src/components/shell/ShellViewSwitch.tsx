import {Menu} from '@mantine/core';
import {IconCode, IconFlask, IconPlus, IconSchema, IconTable, type Icon} from '@tabler/icons-react';
import {Fragment, type KeyboardEvent, type ReactElement} from 'react';
import {cx} from '#ui/cx';
import type {ShellView} from './shell-types';
import * as classes from './shell.module.css';

const VIEWS: {label: string; value: ShellView; icon: Icon}[] = [
    {label: 'Flow', value: 'flow', icon: IconSchema},
    {label: 'Boxed', value: 'boxed', icon: IconTable},
    {label: 'Code', value: 'code', icon: IconCode},
    {label: 'Tests', value: 'tests', icon: IconFlask},
];

export interface ShellViewSwitchProps {
    view: ShellView;
    onChange: (view: ShellView) => void;
    views: readonly ShellView[]; // the views of the root path (`ROOT_VIEWS`); any other view cell is disabled
    untypedArguments?: readonly string[]; // the root path is a generic function: these arguments have no type
    hasTests?: boolean; // the root path has a test suite; without one, the Tests cell offers to create it
    onCreateTests?: () => void; // creates the test suite of the root path; omitted when read-only
}

// What a click on the Tests cell does.
type TestsCell = 'open' | 'create' | 'untyped' | 'disabled';

function testsCell(props: ShellViewSwitchProps): TestsCell {
    if (props.view === 'tests') return 'open';
    if (props.untypedArguments?.length) return 'untyped';
    if (!props.views.includes('tests')) return 'disabled';
    if (props.hasTests) return 'open';
    return props.onCreateTests ? 'create' : 'disabled';
}

// A generic function is typed at each call site; the engine cannot run it alone, so it has no tests.
function UntypedHint({names}: {names: readonly string[]}): ReactElement {
    return (
        <div className={classes.menuHint} data-testid="shell-untyped-hint">
            <strong>Only functions with typed arguments can be tested.</strong>
            <span>
                Add {names.length === 1 ? 'a type' : 'types'} to{' '}
                {names.map((name, index) => (
                    <Fragment key={name}>
                        {index > 0 && ', '}
                        <code>{name}</code>
                    </Fragment>
                ))}
                .
            </span>
        </div>
    );
}

/**
 * Picks the view of the Shell body; the root path stays. One header cell per view, like a radio group: Flow, Boxed and
 * Code show the root path in an editor, Tests shows the tests of the root path. A view that cannot show the root path
 * is disabled. The Tests cell of a subject without tests opens a menu that creates them; the Tests cell of a generic
 * function opens a menu that tells which arguments need a type.
 */
export function ShellViewSwitch(props: ShellViewSwitchProps): ReactElement {
    const {view, onChange, views, untypedArguments = [], onCreateTests} = props;
    const tests = testsCell(props);
    const isDisabled = (value: ShellView): boolean =>
        value === 'tests' ? tests === 'disabled' : !views.includes(value);
    // Arrow keys move the selection, as in a native radio group; they skip a disabled cell and a menu.
    const selectable = VIEWS.filter(({value}) => !isDisabled(value) && !(value === 'tests' && tests !== 'open'));
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step =
            event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? 1
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? -1
                  : 0;
        if (step === 0) return;
        event.preventDefault();
        const index = selectable.findIndex((item) => item.value === view);
        const next = selectable[(index + step + selectable.length) % selectable.length]!;
        onChange(next.value);
        event.currentTarget.querySelector<HTMLElement>(`[data-view="${next.value}"]`)?.focus();
    };
    return (
        <div role="radiogroup" aria-label="View" className={classes.viewSwitch} onKeyDown={onKeyDown}>
            {VIEWS.map(({label, value, icon: ViewIcon}) => {
                const checked = value === view;
                const menu = value === 'tests' && (tests === 'create' || tests === 'untyped');
                const cell = (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-haspopup={menu ? 'menu' : undefined}
                        disabled={isDisabled(value)}
                        tabIndex={checked ? 0 : -1}
                        data-view={value}
                        className={cx(classes.viewButton, checked && classes.viewButtonActive)}
                        onClick={menu ? undefined : () => onChange(value)}
                    >
                        <ViewIcon aria-hidden="true" size={16} />
                        {label}
                    </button>
                );
                if (!menu) return cell;
                return (
                    <Menu key={value} position="bottom-end" withinPortal>
                        <Menu.Target>{cell}</Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<IconPlus size={14} />}
                                disabled={tests === 'untyped'}
                                onClick={onCreateTests}
                            >
                                Create Tests
                            </Menu.Item>
                            {tests === 'untyped' && <UntypedHint names={untypedArguments} />}
                        </Menu.Dropdown>
                    </Menu>
                );
            })}
        </div>
    );
}
