import {useEffect, useRef, useState, type KeyboardEvent, type ReactElement} from 'react';
import type {InlineInputProps} from './types';
import styles from './coreNode.module.css';

/** A single-line edit: Enter or click away commits, Escape cancels. A rejected commit keeps the input open. */
export function InlineInput({
    value,
    ariaLabel,
    placeholder,
    align = 'start',
    onCommit,
    onCancel,
}: InlineInputProps): ReactElement {
    const [text, setText] = useState(value);
    const [error, setError] = useState<string>();
    const done = useRef(false);
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        input.current?.focus();
        input.current?.select();
    }, []);

    const commit = () => {
        if (done.current) return;
        const message = onCommit(text);
        if (message) {
            setError(message);
            return;
        }
        done.current = true;
    };

    const cancel = () => {
        if (done.current) return;
        done.current = true;
        onCancel();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation();
        if (event.key === 'Enter') commit();
        else if (event.key === 'Escape') cancel();
    };

    return (
        <input
            ref={input}
            className={`${styles.inlineInput} ${align === 'end' ? styles.inlineEnd : ''} nodrag nowheel`}
            value={text}
            aria-label={ariaLabel}
            aria-invalid={error ? true : undefined}
            title={error}
            placeholder={placeholder}
            onChange={(event) => {
                setText(event.currentTarget.value);
                setError(undefined);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
                if (!error) commit();
                else cancel();
            }}
        />
    );
}
