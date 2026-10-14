import type {ReactElement} from 'react';
import {useDescription} from '../../documentation-service';
import type {DocumentationService} from '../../documentation-service';
import styles from './functionNode.module.css';

export interface DescriptionRowProps {
    documentation: DocumentationService;
    field: string;
}

/** The node description under the header. Full node width; it never changes the node width. */
export function DescriptionRow({documentation, field}: DescriptionRowProps): ReactElement | null {
    const description = useDescription(documentation, field);
    if (!description) return null;
    return (
        <div className={`${styles.row} ${styles.descRow}`} title={description}>
            <span className={styles.descText}>{description}</span>
        </div>
    );
}
