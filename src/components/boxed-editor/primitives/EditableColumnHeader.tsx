import ArrowLeftIcon from '@mui/icons-material/ArrowLeft';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import {useState, type KeyboardEvent, type ReactElement} from 'react';
import {TypeName} from './TypeName';

export interface EditableColumnHeaderProps {
    rowPath: string;
    name: string;
    type?: string;
    typeEditable?: boolean;
    index: number;
    count: number;
    onRename: (name: string) => string | undefined;
    onRetype?: (type: string) => string | undefined;
    onMove: (toIndex: number) => void;
}

/**
 * Shared header editing surface. A click edits the name; clicking the visible type edits the type.
 * Reorder uses explicit buttons because keyboard-accessible controls are preferable to a mouse-only
 * drag affordance and make positional argument changes deliberate.
 */
export function EditableColumnHeader({
    rowPath,
    name,
    type,
    typeEditable,
    index,
    count,
    onRename,
    onRetype,
    onMove,
}: EditableColumnHeaderProps): ReactElement {
    const [editing, setEditing] = useState<'name' | 'type' | null>(null);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string>();

    const begin = (part: 'name' | 'type'): void => {
        setEditing(part);
        setDraft(part === 'name' ? name : (type ?? ''));
        setError(undefined);
    };
    const commit = (): void => {
        const value = draft.trim();
        if (!value) {
            setError('A value is required.');
            return;
        }
        const nextError = editing === 'name' ? onRename(value) : onRetype?.(value);
        if (nextError) {
            setError(nextError);
            return;
        }
        setEditing(null);
    };
    const keyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setEditing(null);
    };

    return (
        <Box
            data-testid={`column-${rowPath}-${name}`}
            sx={{display: 'flex', alignItems: 'center', minWidth: 0, width: '100%', position: 'relative'}}
        >
            <Box sx={{display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, px: 0.5}}>
                {editing === 'name' ? (
                    <TextField
                        autoFocus
                        size="small"
                        value={draft}
                        error={Boolean(error)}
                        helperText={error}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={keyDown}
                        onBlur={commit}
                        slotProps={{htmlInput: {'aria-label': `Rename ${name}`}}}
                    />
                ) : (
                    <Box component="button" type="button" onClick={() => begin('name')} sx={buttonSx}>
                        <TypeName type={type}>{name}</TypeName>
                    </Box>
                )}
                {typeEditable &&
                    (editing === 'type' ? (
                        <TextField
                            autoFocus
                            size="small"
                            value={draft}
                            error={Boolean(error)}
                            helperText={error}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={keyDown}
                            onBlur={commit}
                            slotProps={{htmlInput: {'aria-label': `Change type of ${name}`}}}
                        />
                    ) : (
                        <Box
                            component="button"
                            type="button"
                            aria-label={`Edit type ${name}`}
                            onClick={() => begin('type')}
                            sx={typeButtonSx}
                        >
                            {type ?? 'any'}
                        </Box>
                    ))}
            </Box>
            <IconButton
                size="small"
                aria-label={`Move ${name} left`}
                disabled={index === 0}
                onClick={() => onMove(index - 1)}
            >
                <ArrowLeftIcon fontSize="small" />
            </IconButton>
            <IconButton
                size="small"
                aria-label={`Move ${name} right`}
                disabled={index === count - 1}
                onClick={() => onMove(index + 1)}
            >
                <ArrowRightIcon fontSize="small" />
            </IconButton>
        </Box>
    );
}

const buttonSx = {
    p: 0,
    border: 0,
    bgcolor: 'transparent',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'text',
    minWidth: 0,
};

const typeButtonSx = {
    ...buttonSx,
    color: 'text.secondary',
    fontSize: '0.6875rem',
};
