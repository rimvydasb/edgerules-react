import {useState, type KeyboardEvent, type ReactElement} from 'react';
import {useDescription} from '../hooks/useDescription';
import * as classes from '../boxedEditor.module.css';

export interface DescriptionCellProps {
    path: string;
}

/**
 * Free-text description overlay for one row (`DocumentationService`, keyed by the same fully
 * qualified `path` every row carries). Empty and read-only when no `documentationService` was
 * provided to the editor.
 */
export function DescriptionCell({path}: DescriptionCellProps): ReactElement {
    const {description, setDescription, readOnly} = useDescription(path);
    const [draft, setDraft] = useState<string | undefined>(undefined);
    const value = draft ?? description;

    const commit = (): void => {
        if (draft !== undefined && draft !== description) setDescription(draft);
        setDraft(undefined);
    };

    return (
        <input
            className={classes.descriptionInput}
            placeholder={readOnly ? undefined : '…'}
            value={value}
            disabled={readOnly}
            aria-label={`description ${path}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') event.currentTarget.blur();
            }}
        />
    );
}
