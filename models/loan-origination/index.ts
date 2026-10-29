import type {ProjectBundleInput} from '../../src/components/project-session';
import {LOAN_ORIGINATION_DOCUMENTATION} from './documentation';
import {LOAN_ORIGINATION_FLOW} from './flow';
import {LOAN_ORIGINATION_DSL} from './model';
import {LOAN_ORIGINATION_TESTS} from './tests';

export {LOAN_ORIGINATION_DOCUMENTATION, LOAN_ORIGINATION_DSL, LOAN_ORIGINATION_FLOW, LOAN_ORIGINATION_TESTS};

/** The loan origination project: pass it to `ProjectFactory.createBundle`. */
export const LOAN_ORIGINATION_PROJECT: ProjectBundleInput = {
    name: 'Loan origination',
    description: 'Scores, checks, prices and decides a joint mortgage application',
    tags: ['finance', 'loan', 'origination', 'scorecard', 'decision-table', 'workbook'],
    model: {dsl: LOAN_ORIGINATION_DSL, name: 'Mortgage Origination', version: '2.0.0'},
    documentation: LOAN_ORIGINATION_DOCUMENTATION,
    tests: LOAN_ORIGINATION_TESTS,
    flow: LOAN_ORIGINATION_FLOW,
};
