import type {Meta, StoryObj} from '@storybook/react-vite';
import {LOAN_ORIGINATION_PROJECT} from '../../models/loan-origination';
import {renderShellHost, SHELL_HOST_ARG_TYPES, ShellHost} from '../support/ShellHost';
import {openStoryProject} from '../support/storyProject';

// The loan origination project of models/loan-origination in the Shell: applicant and application records, a
// scorecard, policy rules, pricing and decision tables, a `@Service`, two workbooks with charts, and tests. Each story
// opens one entity of it; the controls open any other path or view.
const meta: Meta<typeof ShellHost> = {
    title: 'Models/Loan Origination',
    component: ShellHost,
    parameters: {layout: 'fullscreen'},
    argTypes: SHELL_HOST_ARG_TYPES,
    args: {defaultExplorerOpen: true},
    loaders: [async () => ({session: await openStoryProject(LOAN_ORIGINATION_PROJECT)})],
    render: renderShellHost,
};
export default meta;

type Story = StoryObj<typeof ShellHost>;

/** The whole project with the Project Explorer open. */
export const Overview: Story = {};

/** The `applicantScorecard` decision table: every characteristic of the applicant falls into one bin of points. */
export const Scorecard: Story = {args: {defaultPath: 'applicantScorecard'}};

/** The `decisionMatrix` decision table: knockouts, grade, LTV and DSTI decide APPROVE, REFER or DECLINE. */
export const DecisionMatrix: Story = {args: {defaultPath: 'decisionMatrix'}};

/** The `loanOriginationDecision` service in the Boxed view: the records, the per-applicant decisions, the pricing and the offer. */
export const Service: Story = {args: {defaultPath: 'loanOriginationDecision'}};

/**
 * The `originationBook` workbook: the loan terms and two applicants make the joint application; the scorecards of both
 * applicants as charts, and the decision, the offer, the affordability and the household grade as outputs.
 */
export const OriginationBook: Story = {args: {defaultPath: 'originationBook', defaultView: 'flow'}};

/** The `capacityBook` workbook: the largest affordable loan of a household for each term. */
export const CapacityBook: Story = {args: {defaultPath: 'capacityBook', defaultView: 'flow'}};

/** The tests of the `loanOriginationDecision` service: joint and single applications, one per outcome. Run all to check every case. */
export const ServiceTests: Story = {args: {defaultPath: 'loanOriginationDecision', defaultView: 'tests'}};
