import type {Meta, StoryObj} from '@storybook/react-vite';
import {fn, userEvent, within} from 'storybook/test';
import {ProjectExplorer} from '../../../src/components/project-explorer';
import {MODEL_DSL} from '../../../src/components/project-explorer/testing/model.dsl';
import {openStoryProject} from '../../support/storyProject';

// The engine facade of a project session over real `@edgerules/web` in an actual browser, not a mock.
async function buildService(code: string) {
    return (await openStoryProject(code)).engine;
}

const meta: Meta<typeof ProjectExplorer> = {
    title: 'Components/Project Explorer',
    component: ProjectExplorer,
    args: {onCollapsedChange: fn(), readOnly: false},
    // A side panel: fixed width, full height, with a frame like the Node palette of the Flow Editor.
    decorators: [
        (Story) => (
            <div
                style={{
                    width: 256,
                    height: 480,
                    display: 'flex',
                    border: '1px solid var(--mantine-color-default-border)',
                }}
            >
                <Story />
            </div>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof ProjectExplorer>;

export const Default: Story = {
    loaders: [async () => ({service: await buildService(MODEL_DSL)})],
    render: (args, {loaded}) => <ProjectExplorer {...args} service={loaded.service} style={{flex: 1}} />,
};

/** The workbook expanded to its nodes, and the tests of two subjects. */
export const Expanded: Story = {
    args: {testSubjects: ['*', 'riskScore'], onOpen: fn(), onCreateTest: fn()},
    loaders: [async () => ({service: await buildService(MODEL_DSL)})],
    render: (args, {loaded}) => <ProjectExplorer {...args} service={loaded.service} style={{flex: 1}} />,
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        await userEvent.click(await canvas.findByText('loanBook'));
    },
};

/** The add button of a section header creates a new entity with `service.set` and opens it. */
export const CreateEntity: Story = {
    args: {onOpen: fn()},
    loaders: [async () => ({service: await buildService(MODEL_DSL)})],
    render: (args, {loaded}) => <ProjectExplorer {...args} service={loaded.service} style={{flex: 1}} />,
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        await userEvent.click(await canvas.findByRole('button', {name: 'Add to Methods'}));
    },
};
