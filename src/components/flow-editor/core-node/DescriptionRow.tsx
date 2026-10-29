import type {ReactElement} from 'react';
import {useDescription} from '../../documentation-service';
import {InlineInput} from './InlineInput';
import type {DescriptionLineProps, DescriptionRowProps} from './types';
import styles from './coreNode.module.css';

/** The node description under the header, from the documentation service. */
export function DescriptionRow({
    documentation,
    field,
    editing,
    readOnly,
    onEditingChange,
}: DescriptionRowProps): ReactElement | null {
    const description = useDescription(documentation, field);
    return (
        <DescriptionLine
            description={description}
            ariaLabel={`Description of ${field}`}
            placeholder="Describe what this node decides"
            editing={editing}
            readOnly={readOnly}
            onCommit={(text) => documentation.setDescription(field, text)}
            onEditingChange={onEditingChange}
        />
    );
}

/** A description row: full node width; it never changes the node width. An empty commit deletes the description. */
export function DescriptionLine({
    description,
    ariaLabel,
    placeholder,
    editing,
    readOnly,
    onCommit,
    onEditingChange,
}: DescriptionLineProps): ReactElement | null {
    if (editing) {
        return (
            <div className={`${styles.row} ${styles.descRow} ${styles.descEditing}`}>
                <InlineInput
                    value={description ?? ''}
                    ariaLabel={ariaLabel}
                    placeholder={placeholder}
                    onCommit={(text) => {
                        onCommit(text.trim());
                        onEditingChange(false);
                    }}
                    onCancel={() => onEditingChange(false)}
                />
            </div>
        );
    }
    if (!description) return null;
    return (
        <div
            className={`${styles.row} ${styles.descRow} ${readOnly ? '' : styles.descEditable}`}
            title={readOnly ? description : `${description} (click to edit)`}
            onClick={readOnly ? undefined : () => onEditingChange(true)}
        >
            <span className={styles.descText}>{description}</span>
        </div>
    );
}
