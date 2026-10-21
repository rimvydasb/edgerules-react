import type {ReactElement} from 'react';
import {InlineInput} from './InlineInput';
import type {EditableNameProps} from './types';
import styles from './coreNode.module.css';

/** A right-aligned row name: an inline input while editing, a click-to-rename button, or plain text. */
export function EditableName({
    name,
    editing,
    editable,
    title,
    ariaLabel,
    className,
    onStartEditing,
    onCommit,
    onCancel,
}: EditableNameProps): ReactElement {
    if (editing) {
        return <InlineInput value={name} align="end" ariaLabel={ariaLabel} onCommit={onCommit} onCancel={onCancel} />;
    }
    if (editable) {
        return (
            <button type="button" className={`${styles.nameButton} nodrag`} title={title} onClick={onStartEditing}>
                {name}
            </button>
        );
    }
    return (
        <span className={`${styles.nameText} ${className ?? ''}`} title={title}>
            {name}
        </span>
    );
}
