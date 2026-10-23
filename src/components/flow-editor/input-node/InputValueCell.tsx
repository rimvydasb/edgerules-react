import {useMemo, type ReactElement} from 'react';
import {CodeEditorCell, type CodeEditorEmbedContext, type CodeEditorService} from '../../code-editor-cell';
import {HighlightedCode} from '../../code-editor-cell/internal';
import {RECORD_VALUE} from './layout';
import styles from './inputNode.module.css';

export interface InputValueCellProps {
    name: string; // field name, for the accessible labels
    value?: string; // expression text; undefined for a nested record
    editing: boolean;
    languageService?: CodeEditorService; // without it the value is read-only
    readOnly: boolean;
    embedContext: () => CodeEditorEmbedContext; // read when the editor opens
    onStartEditing: () => void;
    /** Returns an error text to keep the editor open, or nothing when the commit succeeded. */
    onCommit: (text: string) => string | void;
    onClose: () => void; // after a successful commit or on Escape
    onErrorChange: (error: string | undefined) => void;
}

/**
 * The value of one InputNode field: highlighted text, and a `CodeEditorCell` while editing. Enter or blur writes
 * the expression to the model; Escape restores the value.
 */
export function InputValueCell({
    name,
    value,
    editing,
    languageService,
    readOnly,
    embedContext,
    onStartEditing,
    onCommit,
    onClose,
    onErrorChange,
}: InputValueCellProps): ReactElement {
    // Built once per edit: the model does not change while the editor is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const context = useMemo(() => (editing ? embedContext() : undefined), [editing]);

    if (value === undefined) {
        return (
            <div className={`${styles.value} ${styles.record}`} title="A nested record">
                {RECORD_VALUE}
            </div>
        );
    }

    if (editing && languageService) {
        return (
            // `nodrag nowheel nokey`: typing, selecting and scrolling stay in the editor, not on the canvas.
            <div
                className={`${styles.value} ${styles.editor} nodrag nowheel nokey`}
                data-testid={`value-editor-${name}`}
            >
                <CodeEditorCell
                    value={value}
                    service={languageService}
                    embedContext={context}
                    autoFocus
                    onChange={() => onErrorChange(undefined)}
                    onCommit={(text) => {
                        const failed = text === value ? undefined : onCommit(text);
                        if (failed) {
                            onErrorChange(failed);
                            return;
                        }
                        onErrorChange(undefined);
                        onClose();
                    }}
                    onCancel={() => {
                        onErrorChange(undefined);
                        onClose();
                    }}
                />
            </div>
        );
    }

    if (readOnly || !languageService) {
        return (
            <div className={styles.value} title={value}>
                <HighlightedCode code={value} className={styles.code} />
            </div>
        );
    }

    return (
        <button
            type="button"
            className={`${styles.value} ${styles.editable} nodrag`}
            aria-label={`Value of ${name}`}
            title={`${value} (click to edit)`}
            onClick={onStartEditing}
        >
            <HighlightedCode code={value} className={styles.code} />
        </button>
    );
}
