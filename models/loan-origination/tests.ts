import type {TestCase, TestRow, TestSuite} from '../../src/components/test-cases-service';
import type {TestSuitesDocument} from '../../src/components/project-session';

type RowSpec = [path: string, type: string];
type CaseSpec = [name: string, inputs: string[], assertions: string[]]; // cell texts in the order of the rows

// A list element other than `[0]`: the schema derives only `[0]`, so such a row is user-authored (`custom`), as the
// Duplicate action makes it. A derived-only row is dropped when the Tests view syncs the rows with the schema.
const LATER_ELEMENT = /\[[1-9]\d*\]/;

// One suite: the input rows, the asserted result rows and one test case per column. Every other result path of the
// subject is derived from the schema when the Tests view opens, as a validation row.
function suite(subject: string, inputs: RowSpec[], assertions: RowSpec[], cases: CaseSpec[]): TestSuite {
    const rows = (specs: RowSpec[], section: TestRow['section']): TestRow[] =>
        specs.map(([path, type], order) => ({
            path,
            section,
            order,
            type,
            present: true,
            ...(LATER_ELEMENT.test(path) ? {custom: true} : {}),
        }));
    const values = (specs: RowSpec[], texts: string[]) =>
        Object.fromEntries(specs.map(([path], index) => [path, texts[index] ?? '']));
    return {
        rows: [...rows(inputs, 'inputs'), ...rows(assertions, 'assertions')],
        cases: cases.map(([name, inputTexts, assertionTexts], order): TestCase => ({
            id: `${subject}-${order + 1}`,
            name,
            order,
            inputs: values(inputs, inputTexts),
            assertions: values(assertions, assertionTexts),
        })),
    };
}

// The fields of an `Applicant`, as rows under `prefix`.
const applicantRows = (prefix: string): RowSpec[] => [
    [`${prefix}.name`, 'string'],
    [`${prefix}.birthDate`, 'date'],
    [`${prefix}.employment`, 'string'],
    [`${prefix}.yearsEmployed`, 'number'],
    [`${prefix}.monthlyIncome`, 'number'],
    [`${prefix}.monthlyExpenses`, 'number'],
    [`${prefix}.monthlyDebtPayments`, 'number'],
    [`${prefix}.bureauScore`, 'number'],
    [`${prefix}.delinquencies`, 'number'],
];

// Cell texts of the applicants, in the order of `applicantRows`. An empty applicant binds nothing.
const JONAS = ['Jonas Petraitis', '1988-04-12', 'permanent', '8', '4200', '1300', '250', '765', '0'];
const IEVA = ['Ieva Petraitiene', '1990-09-30', 'contract', '3', '2600', '900', '0', '702', '1'];
const IEVA_DELINQUENT = ['Ieva Petraitiene', '1990-09-30', 'contract', '3', '2600', '900', '0', '702', '3'];
const JONAS_INDEBTED = ['Jonas Petraitis', '1988-04-12', 'permanent', '8', '3800', '1300', '600', '765', '0'];
const JONAS_SENIOR = ['Jonas Petraitis', '1970-01-15', 'permanent', '8', '4200', '1300', '250', '765', '0'];
const TOMAS = ['Tomas Kazlauskas', '2003-02-01', 'self-employed', '1', '5200', '1500', '0', '690', '1'];
const ONA = ['Ona Jankauskiene', '1962-03-01', 'pensioner', '0', '1900', '800', '0', '810', '0'];
const NONE: string[] = Array(9).fill('');

/** `tests.json` of the loan origination project: the service, the scorecard, the policy and the decision tables. */
export const LOAN_ORIGINATION_TESTS: TestSuitesDocument = {
    schemaVersion: 1,
    subjects: {
        loanOriginationDecision: suite(
            'loanOriginationDecision',
            [
                ['application.applicationDate', 'date'],
                ['application.loanAmount', 'number'],
                ['application.propertyValue', 'number'],
                ['application.termYears', 'number'],
                ...applicantRows('application.applicants[0]'),
                ...applicantRows('application.applicants[1]'),
            ],
            [
                ['record.ltv', 'number'],
                ['householdScore', 'number'],
                ['grade.grade', 'string'],
                ['rate', 'number'],
                ['affordability.dsti', 'number'],
                ['knockouts', 'array'],
                ['decision.outcome', 'string'],
                ['decision.reason', 'string'],
                ['offer.amount', 'number'],
                ['offer.monthlyPayment', 'number'],
                ['offer.counterOfferAmount', 'number'],
            ],
            [
                [
                    'Joint mortgage within the policy',
                    ['2026-10-01', '240000', '320000', '25', ...JONAS, ...IEVA],
                    [
                        '0.75',
                        '115',
                        'C',
                        '0.055',
                        '0.321',
                        '[]',
                        'APPROVE',
                        'Within the credit policy',
                        '240000',
                        '1473.81',
                        '0',
                    ],
                ],
                [
                    'High loan-to-value',
                    ['2026-10-01', '290000', '320000', '25', ...JONAS, ...IEVA],
                    [
                        '0.9062',
                        '115',
                        'C',
                        '0.06',
                        '0.3947',
                        '[]',
                        'REFER',
                        'Loan-to-value above 80%',
                        '0',
                        '0',
                        '256000',
                    ],
                ],
                [
                    'Co-applicant with three delinquencies',
                    ['2026-10-01', '240000', '320000', '25', ...JONAS, ...IEVA_DELINQUENT],
                    [
                        '0.75',
                        '105',
                        'D',
                        '0.065',
                        '0.3451',
                        '["Ieva Petraitiene: DELINQUENCIES"]',
                        'DECLINE',
                        'A policy rule failed',
                        '0',
                        '0',
                        '0',
                    ],
                ],
                [
                    'Single applicant, payment too high',
                    ['2026-10-01', '300000', '420000', '20', ...JONAS_INDEBTED, ...NONE],
                    [
                        '0.7143',
                        '175',
                        'A',
                        '0.0425',
                        '0.7819',
                        '[]',
                        'DECLINE',
                        'Debt service above 50% of income',
                        '0',
                        '0',
                        '140439',
                    ],
                ],
                [
                    'Young self-employed applicant',
                    ['2026-10-01', '150000', '320000', '25', ...TOMAS, ...NONE],
                    [
                        '0.4688',
                        '85',
                        'D',
                        '0.065',
                        '0.252',
                        '[]',
                        'REFER',
                        'Risk grade D needs an underwriter',
                        '0',
                        '0',
                        '0',
                    ],
                ],
                [
                    'Loan ends after the age of 75',
                    ['2026-10-01', '240000', '320000', '30', ...JONAS_SENIOR, ...NONE],
                    [
                        '0.75',
                        '185',
                        'A',
                        '0.0425',
                        '0.4493',
                        '["Jonas Petraitis: AGE_AT_MATURITY"]',
                        'DECLINE',
                        'A policy rule failed',
                        '0',
                        '0',
                        '0',
                    ],
                ],
            ],
        ),
        applicantRecord: suite(
            'applicantRecord',
            [['applicationDate', 'date'], ...applicantRows('applicant')],
            [
                ['age', 'number'],
                ['disposableIncome', 'number'],
            ],
            [
                ['Permanent employee', ['2026-10-01', ...JONAS], ['38', '2650']],
                ['Contractor', ['2026-10-01', ...IEVA], ['36', '1700']],
                ['Young self-employed', ['2026-10-01', ...TOMAS], ['23', '3700']],
                ['Pensioner', ['2026-10-01', ...ONA], ['64', '1100']],
            ],
        ),
        scoreApplicant: suite(
            'scoreApplicant',
            [...applicantRows('record.data'), ['record.age', 'number'], ['record.disposableIncome', 'number']],
            [
                ['score', 'number'],
                ['grade.grade', 'string'],
                ['grade.probabilityOfDefault', 'number'],
            ],
            [
                ['Permanent employee, good bureau score', [...JONAS, '38', '2650'], ['175', 'A', '0.005']],
                ['Contractor with one delinquency', [...IEVA, '36', '1700'], ['115', 'C', '0.03']],
                ['Young self-employed', [...TOMAS, '23', '3700'], ['85', 'D', '0.07']],
                ['Pensioner, excellent bureau score', [...ONA, '64', '1100'], ['125', 'C', '0.03']],
            ],
        ),
        policyRules: suite(
            'policyRules',
            [
                ['age', 'number'],
                ['termYears', 'number'],
                ['employment', 'string'],
                ['bureauScore', 'number'],
                ['delinquencies', 'number'],
            ],
            [
                ['allPassed', 'boolean'],
                ['failed', 'array'],
            ],
            [
                ['Every rule passes', ['38', '25', 'permanent', '765', '0'], ['true', '[]']],
                ['Under 18', ['17', '20', 'contract', '700', '0'], ['false', '["AGE_MIN"]']],
                ['Older than 75 at maturity', ['56', '30', 'permanent', '765', '0'], ['false', '["AGE_AT_MATURITY"]']],
                [
                    'Unemployed with a poor history',
                    ['30', '25', 'unemployed', '520', '3'],
                    ['false', '["EMPLOYED","BUREAU_MIN","DELINQUENCIES"]'],
                ],
            ],
        ),
        riskGrade: suite(
            'riskGrade',
            [['score', 'number']],
            [
                ['grade', 'string'],
                ['probabilityOfDefault', 'number'],
            ],
            [
                ['Top score', ['205'], ['A', '0.005']],
                ['Lowest A', ['170'], ['A', '0.005']],
                ['Highest B', ['169'], ['B', '0.012']],
                ['Middle C', ['115'], ['C', '0.03']],
                ['Lowest D', ['80'], ['D', '0.07']],
                ['Below every band', ['79'], ['E', '0.15']],
            ],
        ),
        pricingGrid: suite(
            'pricingGrid',
            [
                ['grade', 'string'],
                ['ltv', 'number'],
            ],
            [['margin', 'number']],
            [
                ['Grade A, low LTV', ['A', '0.5'], ['0.01']],
                ['Grade A, 75% LTV', ['A', '0.75'], ['0.0125']],
                ['Grade A, high LTV', ['A', '0.9'], ['0.0175']],
                ['Grade B, 80% LTV', ['B', '0.8'], ['0.0175']],
                ['Grade C, 75% LTV', ['C', '0.75'], ['0.025']],
                ['Grade D', ['D', '0.4'], ['0.035']],
                ['Grade E', ['E', '0.5'], ['0.05']],
            ],
        ),
        decisionMatrix: suite(
            'decisionMatrix',
            [
                ['knockouts', 'number'],
                ['grade', 'string'],
                ['ltv', 'number'],
                ['dsti', 'number'],
            ],
            [
                ['outcome', 'string'],
                ['reason', 'string'],
            ],
            [
                ['Within the policy', ['0', 'A', '0.75', '0.32'], ['APPROVE', 'Within the credit policy']],
                ['Knockout', ['1', 'A', '0.75', '0.3'], ['DECLINE', 'A policy rule failed']],
                ['Grade E', ['0', 'E', '0.5', '0.3'], ['DECLINE', 'Risk grade E']],
                ['DSTI above 50%', ['0', 'B', '0.7', '0.55'], ['DECLINE', 'Debt service above 50% of income']],
                ['LTV above 95%', ['0', 'B', '0.97', '0.3'], ['DECLINE', 'Loan-to-value above 95%']],
                ['Grade D', ['0', 'D', '0.5', '0.3'], ['REFER', 'Risk grade D needs an underwriter']],
                ['DSTI above 45%', ['0', 'B', '0.7', '0.47'], ['REFER', 'Debt service above 45% of income']],
                ['LTV above 80%', ['0', 'C', '0.9', '0.39'], ['REFER', 'Loan-to-value above 80%']],
            ],
        ),
        affordability: suite(
            'affordability',
            [
                ['householdIncome', 'number'],
                ['householdDebtPayments', 'number'],
                ['loanAmount', 'number'],
                ['rate', 'number'],
                ['termYears', 'number'],
            ],
            [
                ['payment', 'number'],
                ['stressedPayment', 'number'],
                ['dsti', 'number'],
                ['maxPayment', 'number'],
                ['maxLoan', 'number'],
            ],
            [
                [
                    'Joint household',
                    ['6800', '250', '240000', '0.055', '25'],
                    ['1473.81', '1932.55', '0.321', '2810', '348970'],
                ],
                [
                    'Indebted single household',
                    ['3800', '600', '300000', '0.0425', '20'],
                    ['1857.7', '2371.13', '0.7819', '1110', '140439'],
                ],
                [
                    'Debts above the DSTI limit',
                    ['2000', '1200', '100000', '0.05', '10'],
                    ['1060.66', '1213.28', '1.2066', '0', '0'],
                ],
            ],
        ),
    },
};
