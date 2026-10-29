import {Modal, TextInput, Textarea, Tooltip} from '@mantine/core';
import type {PortableNode} from '@edgerules/portable';
import {IconSettings} from '@tabler/icons-react';
import {useState, type ReactElement} from 'react';
import {setWithLinkCheck} from '#lib/linkCheck';
import {isPortableError} from '#lib/portable';
import {portableAtPath} from '#lib/portableUtils';
import {cx} from '#ui/cx';
import {useProjectSession} from '../project-session';
import {annotationAt} from './shell-path';
import * as classes from './shell.module.css';

export interface ShellSettingsProps {
    root: string; // '*' or the path of an annotated entity
}

// The values of the form when it opens.
interface SettingsForm {
    name: string;
    version: string;
    description: string;
}

// A field of the dialog is one ruled row of the sheet: the label (and its hint) on the left, the input on the right.
const FIELD_CLASSES = {
    root: classes.settingsField,
    label: classes.settingsLabel,
    description: classes.settingsHint,
    wrapper: classes.settingsInputCell,
    input: classes.settingsInput,
};

/**
 * The header cell left of the view switch that opens the settings of the root path: the model ('*') or an annotated
 * entity such as a `@Workbook`. The dialog edits the name (the model name, or the `name` of the annotation), the
 * model version (the model only) and the description of the documentation store. The dialog is a sheet of glass in
 * the drawing of a Flow node: a one-step header with the kind tile, sharp 1px ruled rows, and a row of step cells at
 * the bottom; the page behind it shows through, blurred.
 */
export function ShellSettings({root}: ShellSettingsProps): ReactElement {
    const session = useProjectSession();
    const isModel = root === '*';
    const [form, setForm] = useState<SettingsForm | undefined>();
    const [error, setError] = useState<string | undefined>();
    const model = session.engine.toPortable();
    const annotation = annotationAt(model, root);
    const title = isModel ? 'Model settings' : `${annotation?.node ?? 'Entity'} settings`;

    const open = () => {
        const current = session.engine.toPortable();
        setForm({
            name: isModel
                ? typeof current['@model-name'] === 'string'
                    ? current['@model-name']
                    : ''
                : (annotationAt(current, root)?.name ?? ''),
            version: isModel && typeof current['@model-version'] === 'string' ? current['@model-version'] : '',
            description: session.documentation.getDescription(root) ?? '',
        });
        setError(undefined);
    };
    const close = () => setForm(undefined);

    const save = (values: SettingsForm) => {
        const result = session.transaction(() => {
            if (isModel) {
                const metadata = {name: values.name, version: values.version};
                const command = session.execute({type: 'setModelMetadata', metadata});
                if (!command.ok) throw command.error;
            } else {
                const previous = portableAtPath(session.engine.toPortable(), root) as Record<string, unknown>;
                const {'@node-name': _name, ...rest} = previous;
                const name = values.name.trim();
                const next = (name === '' ? rest : {...rest, '@node-name': name}) as unknown as PortableNode;
                if (name !== (annotation?.name ?? '')) {
                    const written = setWithLinkCheck(session.engine, root, next, previous as unknown as PortableNode);
                    if (isPortableError(written)) throw new Error(written.message);
                }
            }
            if (values.description.trim() !== (session.documentation.getDescription(root) ?? '')) {
                session.documentation.setDescription(root, values.description.trim());
            }
        });
        if (!result.ok) {
            setError(result.error.message);
            return;
        }
        close();
    };

    return (
        <>
            <Tooltip label={title} position="bottom-end" withArrow>
                <button
                    type="button"
                    aria-label={title}
                    aria-haspopup="dialog"
                    className={cx(classes.viewButton, classes.settingsButton)}
                    onClick={open}
                    data-testid="shell-settings"
                >
                    <IconSettings aria-hidden="true" size={18} />
                </button>
            </Tooltip>
            <Modal
                opened={form !== undefined}
                onClose={close}
                title={
                    <>
                        <span className={classes.settingsTile} aria-hidden="true">
                            <IconSettings size={18} />
                        </span>
                        <span className={classes.settingsTitleText}>{title}</span>
                    </>
                }
                size="md"
                radius={0}
                centered
                closeButtonProps={{iconSize: 18}}
                overlayProps={{backgroundOpacity: 0.12}}
                classNames={{
                    content: classes.settingsDialog,
                    header: classes.settingsHeader,
                    title: classes.settingsTitle,
                    close: classes.settingsClose,
                    body: classes.settingsBody,
                }}
            >
                {form && (
                    <form
                        className={classes.settingsForm}
                        onSubmit={(event) => {
                            event.preventDefault();
                            save(form);
                        }}
                    >
                        <TextInput
                            data-autofocus
                            variant="unstyled"
                            classNames={FIELD_CLASSES}
                            inputWrapperOrder={['label', 'input', 'description']}
                            label="Name"
                            description={
                                isModel
                                    ? 'The name of the model'
                                    : `The name of the @${annotation?.node ?? 'Node'} annotation; empty shows the field name`
                            }
                            placeholder={isModel ? 'Model' : root.split('.').at(-1)}
                            value={form.name}
                            onChange={(event) => setForm({...form, name: event.currentTarget.value})}
                        />
                        {isModel && (
                            <TextInput
                                variant="unstyled"
                                classNames={FIELD_CLASSES}
                                label="Version"
                                placeholder="1.0.0"
                                value={form.version}
                                onChange={(event) => setForm({...form, version: event.currentTarget.value})}
                            />
                        )}
                        <Textarea
                            variant="unstyled"
                            classNames={FIELD_CLASSES}
                            label="Description"
                            rows={4}
                            resize="vertical"
                            value={form.description}
                            onChange={(event) => setForm({...form, description: event.currentTarget.value})}
                        />
                        {error && (
                            <div role="alert" className={classes.settingsError}>
                                {error}
                            </div>
                        )}
                        <div className={classes.settingsActions}>
                            <button type="button" className={classes.settingsAction} onClick={close}>
                                Cancel
                            </button>
                            <button type="submit" className={cx(classes.settingsAction, classes.settingsSave)}>
                                Save
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </>
    );
}
