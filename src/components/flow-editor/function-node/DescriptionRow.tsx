import type {ReactElement} from 'react';
import {useDescription} from '../../documentation-service';
import type {DocumentationService} from '../../documentation-service';
import {InlineInput} from './InlineInput';
import styles from './functionNode.module.css';

export interface DescriptionRowProps {
    documentation: DocumentationService;
    field: string;
    editing: boolean;
    readOnly?: boolean;
    onEditingChange: (editing: boolean) => void;
}

/** The node description under the header. Full node width; it never changes the node width. */
export function DescriptionRow({
    documentation,
    field,
    editing,
    readOnly,
    onEditingChange,
}: DescriptionRowProps): ReactElement | null {
    const description = useDescription(documentation, field);
    if (editing) {
        return (
            <div className={`${styles.row} ${styles.descRow} ${styles.descEditing}`}>
                <InlineInput
                    value={description ?? ''}
                    ariaLabel={`Description of ${field}`}
                    placeholder="Describe what this node decides"
                    onCommit={(text) => {
                        // An empty text deletes the description.
                        documentation.setDescription(field, text.trim());
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
