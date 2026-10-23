import {Button, Group, Modal, Text, TextInput} from '@mantine/core';
import {useEffect, useState, type ReactElement} from 'react';
import type {BoxedRowData} from '../boxed-editor-types';
import {useRowCommands} from '../commands/useRowCommands';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {useBoxedEditorUi} from '../context/BoxedEditorUiContext';
import * as classes from '../boxedEditor.module.css';

export interface ModelSettingsDialogProps {
    row: BoxedRowData;
}

/**
 * `Model Settings` — the model-level name/version form opened from the `model` row's menu.
 * Commits through the same `setBoxedRowData('*', …)` every other whole-row edit uses; see
 * `docs/engine-bug-reports.md` ("Root metadata … is silently dropped by `set('*', …)`") for why neither
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
        <Modal opened={modelSettingsOpen} onClose={closeModelSettings} title="Model settings" size="sm" centered>
            <div className={classes.dialogBody}>
                <TextInput data-autofocus label="Name" value={name} onChange={(event) => setName(event.target.value)} />
                <TextInput label="Version" value={version} onChange={(event) => setVersion(event.target.value)} />
                {error && (
                    <Text role="alert" size="sm" c="red">
                        {error}
                    </Text>
                )}
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" onClick={closeModelSettings}>
                        Cancel
                    </Button>
                    <Button onClick={save}>Save</Button>
                </Group>
            </div>
        </Modal>
    );
}
