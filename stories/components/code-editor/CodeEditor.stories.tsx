import {useState, type ReactElement} from 'react';
import {Button, Group, Text} from '@mantine/core';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {CodeEditor} from '../../../src/components/code-editor';
import {INVALID_MODEL_DSL, VALID_MODEL_DSL} from '../../../src/components/code-editor/testing/model.dsl';
import {
    ProjectProvider,
    useProjectSession,
    useProjectSnapshot,
    type ProjectSession,
} from '../../../src/components/project-session';
import {openStoryProject} from '../../support/storyProject';

async function buildService() {
    await init();
    return MutableDecisionService;
}

function StatefulCodeEditor({
    service,
    initialValue,
}: {
    service: typeof MutableDecisionService;
    initialValue: string;
}): ReactElement {
    const [value, setValue] = useState(initialValue);
    return <CodeEditor value={value} onChange={setValue} service={service} />;
}

const meta: Meta<typeof CodeEditor> = {
    title: 'Code Editor/CodeEditor',
    component: CodeEditor,
    parameters: {
        docs: {
            description: {
                component:
                    'EdgeRules code editor: syntax highlighting, engine diagnostics, Ctrl+Space completion, ' +
                    'Ctrl+Click / F12 go-to-definition, Shift-Alt-F formatting.',
            },
        },
    },
};

export default meta;

type Story = StoryObj<typeof CodeEditor>;

export const Default: Story = {
    loaders: [async () => ({service: await buildService()})],
    render: (_args, {loaded}) => (
        <StatefulCodeEditor service={loaded.service as typeof MutableDecisionService} initialValue={VALID_MODEL_DSL} />
    ),
};

export const WithSyntaxError: Story = {
    loaders: [async () => ({service: await buildService()})],
    render: (_args, {loaded}) => (
        <StatefulCodeEditor
            service={loaded.service as typeof MutableDecisionService}
            initialValue={INVALID_MODEL_DSL}
        />
    ),
};

// The editor text is the session's DSL draft: typing keeps it in memory, Commit validates it into the engine, and
// Save writes the whole project to the local repository.
function SessionCodeEditor(): ReactElement {
    const session = useProjectSession();
    const snapshot = useProjectSnapshot();
    const [message, setMessage] = useState('');

    const commit = (): void => {
        const result = session.execute({type: 'commitDsl', source: session.getDslDraft()});
        setMessage(result.ok ? 'Committed' : result.error.message);
    };
    const save = (): void => {
        session.save().then(
            (result) => setMessage(`Saved revision ${result.revision}`),
            (error: unknown) => setMessage(error instanceof Error ? error.message : String(error)),
        );
    };

    return (
        <>
            <CodeEditor value={session.getDslDraft()} onChange={session.setDslDraft} service={MutableDecisionService} />
            <Group gap="xs" mt="xs">
                <Button size="compact-sm" onClick={commit} disabled={!snapshot.hasDslDraft}>
                    Commit
                </Button>
                <Button size="compact-sm" onClick={save} disabled={snapshot.dirtySlices.length === 0}>
                    Save
                </Button>
            </Group>
            <Text size="xs" mt="xs" data-testid="session-status">
                {snapshot.phase} · revision {snapshot.revision} · dirty: {snapshot.dirtySlices.join(', ') || 'none'} ·
                DSL {snapshot.dslValidity.status}
            </Text>
            <Text size="xs" data-testid="session-message">
                {message}
            </Text>
        </>
    );
}

/** Edits a project's model through its session: draft, commit, save. A save stores canonical DSL (comments drop). */
export const ProjectSessionDraft: Story = {
    loaders: [async () => ({session: await openStoryProject(VALID_MODEL_DSL)})],
    render: (_args, {loaded}) => (
        <ProjectProvider session={loaded.session as ProjectSession}>
            <SessionCodeEditor />
        </ProjectProvider>
    ),
};
