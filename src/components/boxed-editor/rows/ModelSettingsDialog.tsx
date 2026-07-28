import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import {useEffect, useState, type ReactElement} from 'react';
import type {BoxedRowData} from '../boxed-editor-types';
import {useRowCommands} from '../commands/useRowCommands';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {useBoxedEditorUi} from '../context/BoxedEditorUiContext';

export interface ModelSettingsDialogProps {
    row: BoxedRowData;
}

/**
 * `Model Settings` — the model-level name/version form opened from the `model` row's menu.
 * Commits through the same `setBoxedRowData('*', …)` every other whole-row edit uses; see
 * `docs/BUG_REPORTS.md` ("Root metadata … is silently dropped by `set('*', …)`") for why neither
 * field persists past the next reload yet — the form itself is fully wired for when it does.
 */
export function ModelSettingsDialog({row}: ModelSettingsDialogProps): ReactElement {
    const {modelSettingsOpen, closeModelSettings} = useBoxedEditorUi();
    const {service} = useBoxedEditorContext();
    const commands = useRowCommands();
    const [name, setName] = useState(row.name);
    const [version, setVersion] = useState(row.modelVersion ?? '');
    const [error, setError] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!modelSettingsOpen) return;
        setName(row.name);
        setVersion(row.modelVersion ?? '');
        setError(undefined);
        // Reset only on the transition into the open dialog, mirroring `ExpressionCell`'s activate.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelSettingsOpen]);

    const save = (): void => {
        // `row` (from `ModelHeaderRow`) is the root row fetched via `getBoxedRowData('*')`, which —
        // like every path — has its own `children` stripped by the cache; denormalizing that as-is
        // would commit an empty context and wipe the whole model. Fetch the live children first.
        const children = service.getBoxedRowsData(row.path);
        const result = commands.setBoxedRowData(row.path, {
            ...row,
            name,
            modelVersion: version === '' ? undefined : version,
            children,
        });
        if (result) {
            setError(result.message);
            return;
        }
        closeModelSettings();
    };

    return (
        <Dialog open={modelSettingsOpen} onClose={closeModelSettings} maxWidth="xs" fullWidth>
            <DialogTitle>Model settings</DialogTitle>
            <DialogContent sx={{display: 'flex', flexDirection: 'column', gap: 2, pt: 1}}>
                <TextField
                    label="Name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                    fullWidth
                />
                <TextField
                    label="Version"
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                    fullWidth
                />
                {error && (
                    <Box role="alert" sx={{color: 'error.main', fontSize: '0.8rem'}}>
                        {error}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={closeModelSettings}>Cancel</Button>
                <Button onClick={save} variant="contained">
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
