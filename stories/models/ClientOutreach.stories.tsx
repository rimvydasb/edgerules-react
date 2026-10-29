import type {Meta, StoryObj} from '@storybook/react-vite';
import {CLIENT_OUTREACH_PROJECT} from '../../models/client-outreach';
import {registerHighsSolver} from '../support/highsSolver';
import {renderShellHost, SHELL_HOST_ARG_TYPES, ShellHost} from '../support/ShellHost';
import {openStoryProject} from '../support/storyProject';

// The client outreach project of models/client-outreach in the Shell: an `optimise` element (HiGHS MILP) over decision
// tables picks which of 100 prospects two workers call, email or text in one day. Each story opens one entity of it;
// the controls open any other path or view.
const meta: Meta<typeof ShellHost> = {
    title: 'Models/Client Outreach',
    component: ShellHost,
    parameters: {layout: 'fullscreen'},
    argTypes: SHELL_HOST_ARG_TYPES,
    args: {defaultExplorerOpen: true},
    loaders: [
        async () => {
            const session = await openStoryProject(CLIENT_OUTREACH_PROJECT);
            await registerHighsSolver(session.engine);
            return {session};
        },
    ],
    render: renderShellHost,
};
export default meta;

type Story = StoryObj<typeof ShellHost>;

/** The whole project with the Project Explorer open. */
export const Overview: Story = {};

/** The `contactMix` optimisation: how many clients of each segment to call, email or text within the working day. */
export const ContactMix: Story = {args: {defaultPath: 'contactMix'}};

/** The `outreachBook` workbook: the team and the clients feed the contact plan; its summary, plan and schedule as outputs. */
export const OutreachBook: Story = {args: {defaultPath: 'outreachBook', defaultView: 'flow'}};

/** The tests of the `contactPlan` service. Run all to check every case. */
export const ServiceTests: Story = {args: {defaultPath: 'contactPlan', defaultView: 'tests'}};
