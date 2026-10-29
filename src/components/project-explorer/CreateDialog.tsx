import {useState, type ReactElement} from 'react';
import {Button, Group, Modal, TextInput} from '@mantine/core';
import {uniqueName, type CreateOption} from './create-templates';
import {isIdentifier} from './tree-model';

export interface CreateDialogProps {
    option: CreateOption; // the kind of the new entity
    taken: ReadonlySet<string>; // the root names the new entity must not take
    onCancel: () => void;
    onCreate: (name: string) => string | undefined; // an error message, or undefined on success
}

/** Asks for the name of a new root entity. */
export function CreateDialog({option, taken, onCancel, onCreate}: CreateDialogProps): ReactElement {
    const [name, setName] = useState(() => uniqueName(option.defaultName, taken));
    const [error, setError] = useState<string | undefined>();

    const submit = () => {
        const trimmed = name.trim();
        if (!isIdentifier(trimmed)) {
            setError('A name starts with a letter or _ and has only letters, digits and _.');
        } else if (taken.has(trimmed)) {
            setError(`"${trimmed}" already exists.`);
        } else {
            setError(onCreate(trimmed));
        }
    };

    return (
        <Modal opened onClose={onCancel} title={`New ${option.label.toLowerCase()}`} size="sm">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                <TextInput
                    label="Name"
                    value={name}
                    error={error}
                    data-autofocus
                    onChange={(event) => {
                        setName(event.currentTarget.value);
                        setError(undefined);
                    }}
                />
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit">Create</Button>
                </Group>
            </form>
        </Modal>
    );
}
