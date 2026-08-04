import TextField from '@mui/material/TextField';
import {useState, type KeyboardEvent, type ReactElement} from 'react';
import {useDescription} from '../hooks/useDescription';

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
        <TextField
            variant="standard"
            size="small"
            fullWidth
            placeholder={readOnly ? undefined : 'Add a description…'}
            value={value}
            disabled={readOnly}
            slotProps={{htmlInput: {'aria-label': `description ${path}`}}}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') event.currentTarget.blur();
            }}
            sx={{
                '& .MuiInputBase-input': {
                    fontSize: '0.8125rem',
                    fontStyle: value ? 'normal' : 'italic',
                },
            }}
        />
    );
}
