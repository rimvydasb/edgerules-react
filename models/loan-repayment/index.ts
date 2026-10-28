import type {ProjectBundleInput} from '../../src/components/project-session';
import {LOAN_REPAYMENT_DOCUMENTATION} from './documentation';
import {LOAN_REPAYMENT_FLOW} from './flow';
import {LOAN_REPAYMENT_DSL} from './model';
import {LOAN_REPAYMENT_TESTS} from './tests';

export {LOAN_REPAYMENT_DOCUMENTATION, LOAN_REPAYMENT_DSL, LOAN_REPAYMENT_FLOW, LOAN_REPAYMENT_TESTS};

/** The loan repayment project: pass it to `ProjectFactory.createBundle`. */
export const LOAN_REPAYMENT_PROJECT: ProjectBundleInput = {
    name: 'Loan repayment',
    description: 'Prices a loan request and returns its monthly repayment schedule',
    tags: ['finance', 'loan', 'decision-table', 'workbook'],
    model: {dsl: LOAN_REPAYMENT_DSL},
    documentation: LOAN_REPAYMENT_DOCUMENTATION,
    tests: LOAN_REPAYMENT_TESTS,
    flow: LOAN_REPAYMENT_FLOW,
};
