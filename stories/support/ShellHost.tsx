import '@xyflow/react/dist/style.css';
import {useState, type ReactElement} from 'react';
import {Code, Group, Text} from '@mantine/core';
import type {ArgTypes, Meta} from '@storybook/react-vite';
import {MutableDecisionService} from '@edgerules/web/mutable';
import {ProjectProvider, type ProjectSession} from '../../src/components/project-session';
import {Shell, type ShellView} from '../../src/components/shell';

export interface ShellHostArgs {
    defaultPath?: string;
    defaultView?: ShellView;
    readOnly?: boolean;
    defaultExplorerOpen?: boolean;
    controlled?: boolean; // the host holds the path and the view, and prints them
}

/** The Shell as a host page embeds it: full height, with the host state printed above it when `controlled`. */
export function ShellHost({
    defaultPath,
    defaultView,
    readOnly,
    defaultExplorerOpen,
    controlled,
}: ShellHostArgs): ReactElement {
    const [path, setPath] = useState(defaultPath ?? '*');
    const [view, setView] = useState<ShellView>(defaultView ?? 'boxed');
    const [forwarded, setForwarded] = useState<string>();
    return (
        <div style={{height: '100vh', display: 'flex', flexDirection: 'column', padding: 12, boxSizing: 'border-box'}}>
            {controlled && (
                <Group gap="md" mb="xs" data-testid="host-state">
                    <Text size="xs">
                        path <Code>{path}</Code>
                    </Text>
                    <Text size="xs">
                        view <Code>{view}</Code>
                    </Text>
                    {forwarded && (
                        <Text size="xs">
                            forwarded to the host <Code>{forwarded}</Code>
                        </Text>
                    )}
                </Group>
            )}
            <div style={{flex: 1, minHeight: 0}}>
                <Shell
                    languageService={MutableDecisionService}
                    readOnly={readOnly}
                    defaultExplorerOpen={defaultExplorerOpen}
                    {...(controlled
                        ? {path, onPathChange: setPath, view, onViewChange: setView}
                        : {defaultPath, defaultView})}
                    onOpenNode={(target) => setForwarded(`${target.kind} ${target.path}`)}
                />
            </div>
        </div>
    );
}

/** Controls of the Shell's initial state: changing one remounts the Shell over the same project session. */
export const SHELL_HOST_ARG_TYPES: Partial<ArgTypes<ShellHostArgs>> = {
    defaultPath: {control: 'text', description: 'The model path the Shell opens: `*`, `applicant`, `riskScore`…'},
    defaultView: {control: 'inline-radio', options: ['boxed', 'code', 'flow', 'tests']},
    readOnly: {control: 'boolean'},
    defaultExplorerOpen: {control: 'boolean'},
    controlled: {table: {disable: true}},
};

/** Renders a story's Shell over the project session its loader opened (`loaded.session`). */
export const renderShellHost: NonNullable<Meta<typeof ShellHost>['render']> = (args, {loaded}) => {
    return (
        <ProjectProvider session={loaded.session as ProjectSession}>
            {/* The Shell reads its `default*` props on mount only: a new key applies a changed control. */}
            <ShellHost key={JSON.stringify(args)} {...args} />
        </ProjectProvider>
    );
};
