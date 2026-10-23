import {useEffect, useMemo, useState, type ReactElement} from 'react';
import type {PortableError} from '@edgerules/portable';
import {CodeEditorCell} from '../../code-editor-cell';
import {HighlightedCode} from '../../code-editor-cell/internal';
import {useRowCommands} from '../commands/useRowCommands';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {useBoxedEditorUi} from '../context/BoxedEditorUiContext';
import {buildExpressionEmbedContext} from '../service/embedContext';
import type {BoxedRowData} from '../boxed-editor-types';
import {cx} from '#ui/cx';
import {ErrorPopover} from '#ui/ErrorPopover';
import * as classes from '../boxedEditor.module.css';

function expressionErrorMessage(error: PortableError, value: string): string {
    if (error.type !== 'Parse') return error.message;
    if (error.message === 'Priority must be a whole number') return error.message;

    const trailingOperator = /(\?\?|&&|\|\||===|!==|==|!=|<=|>=|[+\-*/%<>])$/.exec(value.trim())?.[1];
    if (trailingOperator && error.message.includes('MissingExpression')) {
        return `Expected a value after "${trailingOperator}".`;
    }

    return 'Invalid expression. Check the syntax and try again.';
}

export interface ExpressionCellProps {
    row: BoxedRowData;
    /**
     * Overrides the default whole-row commit at `row.path`. Needed by cells that don't own an
     * addressable path of their own — a ruleset rule's condition/action cells rewrite and commit
     * their *owning* `rule` row instead (Section 7: "Container edits ... rewrite the whole
     * parent"). `row.path` still seeds this cell's active/embed-context identity.
     */
    onCommit?: (value: string) => PortableError | undefined;
}

/**
 * Static text ⇄ `CodeEditorCell` swap for a `field` row's value. At most one `ExpressionCell`
 * across the whole tree is active at a time (`BoxedEditorUiContext.activeCellPath`); every other
 * cell renders static text.
 */
export function ExpressionCell({row, onCommit}: ExpressionCellProps): ReactElement {
    const {service, readOnly, languageService} = useBoxedEditorContext();
    const {activeCellPath, setActiveCellPath} = useBoxedEditorUi();
    const commands = useRowCommands();
    const active = activeCellPath === row.path;
    // `row.readOnly` reflects the engine's input/computed direction label (Alt-reveal tooltip
    // territory), not authoring permission — a computed field's formula is still editable here.
    const editable = !readOnly && languageService !== undefined;

    const [draft, setDraft] = useState(row.value ?? '');
    const [error, setError] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!active) return;
        setDraft(row.value ?? '');
        setError(undefined);
        // Reset only on the transition into edit mode — a fresh edit always starts from the last
        // committed value; further row updates while active come from this same edit's own commit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    const embedContext = useMemo(
        () => (active ? buildExpressionEmbedContext(service.toPortable(), row.path) : undefined),
        [active, service, row.path],
    );

    const activate = (): void => {
        if (!editable) return;
        setActiveCellPath(row.path);
    };

    const commit = (value: string): void => {
        if (value.trim() === '' && onCommit === undefined) {
            setDraft(value);
            setError('A value is required.');
            return;
        }
        const result = onCommit ? onCommit(value) : commands.setBoxedRowData(row.path, {...row, value});
        if (result) {
            setDraft(value);
            setError(expressionErrorMessage(result, value));
            return;
        }
        setActiveCellPath(null);
    };

    const cancel = (): void => {
        setDraft(row.value ?? '');
        setError(undefined);
        setActiveCellPath(null);
    };

    if (!active || !languageService) {
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
                {row.value ? <HighlightedCode code={row.value} /> : null}
            </span>
        );
    }

    return (
        <ErrorPopover message={error}>
            <CodeEditorCell
                value={draft}
                onChange={(value) => {
                    setDraft(value);
                    setError(undefined);
                }}
                onCommit={commit}
                onCancel={cancel}
                service={languageService}
                embedContext={embedContext}
                autoFocus
            />
        </ErrorPopover>
    );
}
