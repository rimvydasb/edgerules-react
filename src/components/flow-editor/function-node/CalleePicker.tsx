import {Combobox, useCombobox} from '@mantine/core';
import {IconChevronDown, IconSearch} from '@tabler/icons-react';
import {useState, type ReactElement} from 'react';
import type {CalleeRef} from '../flow-editor-types';
import {KindIcon} from './KindIcon';
import styles from './functionNode.module.css';

export interface CalleePickerProps {
    callees: CalleeRef[];
    selected?: CalleeRef;
    disabled?: boolean;
    onSelect: (method: string) => void;
}

const GROUPS: {kind: CalleeRef['kind']; label: string}[] = [
    {kind: 'function', label: 'Functions'},
    {kind: 'ruleset', label: 'Rulesets'},
];

function signature(callee: CalleeRef): string {
    return `${callee.path}(${callee.parameters.map((parameter) => parameter.name).join(', ')})`;
}

/** The callee chip. Opens a searchable list of the user functions and rulesets of the model. */
export function CalleePicker({callees, selected, disabled, onSelect}: CalleePickerProps): ReactElement {
    const [search, setSearch] = useState('');
    const combobox = useCombobox({
        onDropdownClose: () => {
            setSearch('');
            combobox.resetSelectedOption();
        },
        onDropdownOpen: () => combobox.focusSearchInput(),
    });
    const query = search.trim().toLowerCase();

    return (
        <Combobox
            store={combobox}
            width={340}
            position="bottom-start"
            withinPortal
            onOptionSubmit={(method) => {
                combobox.closeDropdown();
                if (method !== selected?.path) onSelect(method);
            }}
        >
            <Combobox.Target>
                <button
                    type="button"
                    className={`${styles.chip} ${selected ? '' : styles.chipEmpty} nodrag`}
                    aria-haspopup="listbox"
                    aria-label={selected ? `Callee ${selected.path}` : 'Select callee'}
                    disabled={disabled}
                    onClick={() => combobox.toggleDropdown()}
                >
                    {selected ? (
                        <>
                            <KindIcon kind={selected.kind} size={10} className={styles.kindDot} />
                            <span className={styles.chipName}>{selected.path}</span>
                        </>
                    ) : (
                        'Select a function or ruleset…'
                    )}
                    <IconChevronDown size={12} className={styles.chevron} aria-hidden />
                </button>
            </Combobox.Target>
            <Combobox.Dropdown className="nodrag nowheel">
                <Combobox.Search
                    value={search}
                    onChange={(event) => setSearch(event.currentTarget.value)}
                    placeholder="Search functions and rulesets"
                    aria-label="Search functions and rulesets"
                    leftSection={<IconSearch size={14} />}
                />
                <Combobox.Options mah={300} style={{overflowY: 'auto'}}>
                    {GROUPS.map(({kind, label}) => {
                        const matches = callees.filter(
                            (callee) => callee.kind === kind && callee.path.toLowerCase().includes(query),
                        );
                        if (matches.length === 0) return null;
                        return (
                            <Combobox.Group key={kind} label={label}>
                                {matches.map((callee) => (
                                    <Combobox.Option
                                        key={callee.path}
                                        value={callee.path}
                                        active={callee.path === selected?.path}
                                        className={styles.pick}
                                    >
                                        <KindIcon kind={callee.kind} size={12} className={styles.pickDot} />
                                        <span className={styles.sig}>
                                            {signature(callee)}{' '}
                                            <span className={styles.ret}>→ {callee.returnLabel}</span>
                                        </span>
                                        {callee.path === selected?.path && <span className={styles.check}>✓</span>}
                                    </Combobox.Option>
                                ))}
                            </Combobox.Group>
                        );
                    })}
                    {!callees.some((callee) => callee.path.toLowerCase().includes(query)) && (
                        <Combobox.Empty>No function or ruleset matches</Combobox.Empty>
                    )}
                </Combobox.Options>
                <Combobox.Footer className={styles.pickerFoot}>User-defined only</Combobox.Footer>
            </Combobox.Dropdown>
        </Combobox>
    );
}
