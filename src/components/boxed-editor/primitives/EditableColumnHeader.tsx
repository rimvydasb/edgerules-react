import {ActionIcon} from '@mantine/core';
import {IconChevronLeft, IconChevronRight} from '@tabler/icons-react';
import {useState, type KeyboardEvent, type ReactElement} from 'react';
import * as classes from '../boxedEditor.module.css';
import {TypeName} from './TypeName';

export interface EditableColumnHeaderProps {
    rowPath: string;
    name: string;
    type?: string;
    typeEditable?: boolean;
    index: number;
    count: number;
    onRename: (name: string) => string | undefined;
    onRetype?: (type: string) => string | undefined;
    onMove: (toIndex: number) => void;
}

/**
 * Shared header editing surface. A click edits the name; clicking the visible type edits the type.
 * Reorder uses explicit buttons because keyboard-accessible controls are preferable to a mouse-only
 * drag affordance and make positional argument changes deliberate.
 */
export function EditableColumnHeader({
    rowPath,
    name,
    type,
    typeEditable,
    index,
    count,
    onRename,
    onRetype,
    onMove,
}: EditableColumnHeaderProps): ReactElement {
    const [editing, setEditing] = useState<'name' | 'type' | null>(null);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string>();

    const begin = (part: 'name' | 'type'): void => {
        setEditing(part);
        setDraft(part === 'name' ? name : (type ?? ''));
        setError(undefined);
    };
    const commit = (): void => {
        const value = draft.trim();
        if (!value) {
            setError('A value is required.');
            return;
        }
        const nextError = editing === 'name' ? onRename(value) : onRetype?.(value);
        if (nextError) {
            setError(nextError);
            return;
        }
        setEditing(null);
    };
    const keyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setEditing(null);
    };
    const editor = (label: string): ReactElement => (
        <>
            <input
                autoFocus
                className={classes.headerInput}
                value={draft}
                aria-invalid={Boolean(error)}
                aria-label={label}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={keyDown}
                onBlur={commit}
            />
            {error ? <span className={classes.fieldError}>{error}</span> : null}
        </>
    );

    return (
        <div data-testid={`column-${rowPath}-${name}`} className={classes.columnHeader}>
            <div className={classes.columnHeaderBody}>
                {editing === 'name' ? (
                    editor(`Rename ${name}`)
                ) : (
                    <button type="button" onClick={() => begin('name')} className={classes.textButton}>
                        <TypeName type={type}>{name}</TypeName>
                    </button>
                )}
                {typeEditable &&
                    (editing === 'type' ? (
                        editor(`Change type of ${name}`)
                    ) : (
                        <button
                            type="button"
                            aria-label={`Edit type ${name}`}
                            onClick={() => begin('type')}
                            className={classes.typeButton}
                        >
                            {type ?? 'any'}
                        </button>
                    ))}
            </div>
            <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label={`Move ${name} left`}
                disabled={index === 0}
                onClick={() => onMove(index - 1)}
            >
                <IconChevronLeft size={16} />
            </ActionIcon>
            <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label={`Move ${name} right`}
                disabled={index === count - 1}
                onClick={() => onMove(index + 1)}
            >
                <IconChevronRight size={16} />
            </ActionIcon>
        </div>
    );
}
