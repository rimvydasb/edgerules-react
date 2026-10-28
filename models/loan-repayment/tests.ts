import type {TestCase, TestRow, TestSuite} from '../../src/components/test-cases-service';
import type {TestSuitesDocument} from '../../src/components/project-session';

type RowSpec = [path: string, type: string];
type CaseSpec = [name: string, inputs: string[], assertions: string[]]; // cell texts in the order of the rows

// One suite: the input rows, the asserted result rows and one test case per column. Every other result path of the
// subject is derived from the schema when the Tests view opens, as a validation row.
function suite(subject: string, inputs: RowSpec[], assertions: RowSpec[], cases: CaseSpec[]): TestSuite {
    const rows = (specs: RowSpec[], section: TestRow['section']): TestRow[] =>
        specs.map(([path, type], order) => ({path, section, order, type, present: true}));
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

/** `tests.json` of the loan repayment project: the service, its decision table and its payment function. */
export const LOAN_REPAYMENT_TESTS: TestSuitesDocument = {
    schemaVersion: 1,
    subjects: {
        loanRepayment: suite(
            'loanRepayment',
            [
                ['request.amount', 'number'],
                ['request.years', 'number'],
                ['request.creditScore', 'number'],
            ],
            [
                ['pricing.tier', 'string'],
                ['pricing.approved', 'boolean'],
                ['rate', 'number'],
                ['payment', 'number'],
                ['cost.totalInterest', 'number'],
                ['cost.totalPaid', 'number'],
                ['schedule[0].interest', 'number'],
            ],
            [
                [
                    'Prime mortgage',
                    ['250000', '25', '780'],
                    ['prime', 'true', '0.0425', '1354.35', '156302.48', '406302.48', '885.42'],
                ],
                [
                    'Prime short mortgage',
                    ['200000', '15', '800'],
                    ['prime', 'true', '0.04', '1479.38', '66287.45', '266287.45', '666.67'],
                ],
                [
                    'Standard car loan',
                    ['20000', '5', '700'],
                    ['standard', 'true', '0.05', '377.42', '2645.52', '22645.52', '83.33'],
                ],
                [
                    'Near-prime personal loan',
                    ['15000', '8', '640'],
                    ['near-prime', 'true', '0.065', '200.79', '4276.23', '19276.23', '81.25'],
                ],
                ['Declined application', ['20000', '5', '550'], ['declined', 'false', '0.035', '0', '0', '0', '']],
            ],
        ),
        pricingTier: suite(
            'pricingTier',
            [
                ['creditScore', 'number'],
                ['years', 'number'],
            ],
            [
                ['tier', 'string'],
                ['premium', 'number'],
                ['approved', 'boolean'],
            ],
            [
                ['Excellent score, short term', ['800', '10'], ['prime', '0.005', 'true']],
                ['Excellent score, long term', ['800', '30'], ['prime', '0.0075', 'true']],
                ['Good score', ['720', '30'], ['standard', '0.015', 'true']],
                ['Fair score, short term', ['650', '5'], ['near-prime', '0.03', 'true']],
                ['Fair score, long term', ['650', '20'], ['declined', '0', 'false']],
                ['Poor score', ['520', '5'], ['declined', '0', 'false']],
            ],
        ),
        monthlyPayment: suite(
            'monthlyPayment',
            [
                ['amount', 'number'],
                ['annualRate', 'number'],
                ['years', 'number'],
            ],
            [['', 'number']],
            [
                ['30-year mortgage at 5%', ['180000', '0.05', '30'], ['966.28']],
                ['5-year car loan at 5%', ['20000', '0.05', '5'], ['377.42']],
            ],
        ),
    },
};
