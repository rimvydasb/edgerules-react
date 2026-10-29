import type {Meta, StoryObj} from '@storybook/react-vite';
import {LOAN_REPAYMENT_PROJECT} from '../../models/loan-repayment';
import {renderShellHost, SHELL_HOST_ARG_TYPES, ShellHost} from '../support/ShellHost';
import {openStoryProject} from '../support/storyProject';

// The loan repayment project of models/loan-repayment in the Shell: a decision table, functions, a `@Service`, two
// workbooks with charts, and tests. Each story opens one entity of it; the controls open any other path or view.
const meta: Meta<typeof ShellHost> = {
    title: 'Models/Loan Repayment',
    component: ShellHost,
    parameters: {layout: 'fullscreen'},
    argTypes: SHELL_HOST_ARG_TYPES,
    args: {defaultExplorerOpen: true},
    loaders: [async () => ({session: await openStoryProject(LOAN_REPAYMENT_PROJECT)})],
    render: renderShellHost,
};
export default meta;

type Story = StoryObj<typeof ShellHost>;

/** The whole project with the Project Explorer open. */
export const Overview: Story = {};

/** The `pricingTier` decision table: the credit score and the term select the price tier. */
export const DecisionTable: Story = {args: {defaultPath: 'pricingTier'}};

/**
 * The `mortgageBook` workbook: the repayment plan, the monthly payment, the cost of the loan and the repayment schedule
 * as tables, the remaining balance and the yearly split.
 */
export const MortgageBook: Story = {args: {defaultPath: 'mortgageBook', defaultView: 'flow'}};

/** The `termComparisonBook` workbook: the same loan over 15 and 30 years, and the balance of both by year. */
export const TermComparisonBook: Story = {args: {defaultPath: 'termComparisonBook', defaultView: 'flow'}};

/** The tests of the `loanRepayment` service. Run all to check every case. */
export const ServiceTests: Story = {args: {defaultPath: 'loanRepayment', defaultView: 'tests'}};
