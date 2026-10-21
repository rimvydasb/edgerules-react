import {useEffect, useRef, useState, type KeyboardEvent, type ReactElement} from 'react';
import {useRowCommands} from '../commands/useRowCommands';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {useBoxedEditorUi} from '../context/BoxedEditorUiContext';
import type {BoxedRowData} from '../boxed-editor-types';
import {cx} from '../../../ui/cx';
import {ErrorPopover} from '../../../ui/ErrorPopover';
import * as classes from '../boxedEditor.module.css';

export interface NameCellProps {
    row: BoxedRowData;
}

const RESERVED_NAMES = new Set(['func', 'ruleset', 'type', 'default']);

function identifierError(name: string): string | undefined {
    if (!/^\p{L}[\p{L}\p{N}_]*$/u.test(name)) {
        return 'Names must start with a letter and contain only letters, numbers, or underscores.';
    }
    if (RESERVED_NAMES.has(name)) return `"${name}" is a reserved DSL keyword.`;
    return undefined;
}

/**
 * Static text ⇄ plain-text-input swap for a named row's name cell — commits through `rename`,
 * never a value `set` (a name is a plain identifier, not a DSL expression, so this has no
 * `CodeEditorCell`/diagnostics, unlike `ExpressionCell`). Keyed as `${row.path}#name` in
 * `activeCellPath` so it never collides with that same row's own value cell.
 */
export function NameCell({row}: NameCellProps): ReactElement {
    const {readOnly} = useBoxedEditorContext();
    const {activeCellPath, setActiveCellPath} = useBoxedEditorUi();
    const commands = useRowCommands();
    const cellPath = `${row.path}#name`;
    const active = activeCellPath === cellPath;
    const editable = !readOnly;

    const [draft, setDraft] = useState(row.name);
    const [error, setError] = useState<string | undefined>(undefined);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!active) return;
        setDraft(row.name);
        setError(undefined);
        // Reset only on the transition into edit mode, same as `ExpressionCell`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    useEffect(() => {
        if (!active) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [active]);

    const activate = (): void => {
        if (!editable) return;
        setActiveCellPath(cellPath);
    };

    const commit = (): void => {
        if (draft === row.name) {
            setActiveCellPath(null);
            return;
        }
        if (draft !== '') {
            const validationError = identifierError(draft);
            if (validationError) {
                setError(validationError);
                return;
            }
        }
        const result = commands.rename(row.path, draft);
        if (result) {
            // The shared command channel renders engine/service failures on the owning row.
            // Keep this editor active, but do not duplicate that same error in a second alert.
            return;
        }
        setActiveCellPath(null);
    };

    const cancel = (): void => {
        setDraft(row.name);
        setError(undefined);
        setActiveCellPath(null);
    };

    if (!active) {
        return (
            <span
                tabIndex={editable ? 0 : undefined}
                onClick={activate}
                onKeyDown={(event) => {
                    if (!editable) return;
                    if (event.key === 'Enter' || event.key === 'F2') {
                        event.preventDefault();
                        activate();
                    }
                }}
                className={cx(classes.editableText, editable && classes.editableTextActive)}
            >
                {row.name}
            </span>
        );
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commit();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
        }
    };

    return (
        <ErrorPopover message={error}>
            <input
                ref={inputRef}
                className={classes.nameInput}
                value={draft}
                aria-label={`name ${row.path}`}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commit}
            />
        </ErrorPopover>
    );
}
