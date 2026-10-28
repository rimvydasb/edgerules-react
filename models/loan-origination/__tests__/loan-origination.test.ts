import 'fake-indexeddb/auto';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it} from 'vitest';
import {openFixtureProject} from '../../../src/components/project-session/testing/sessionFixture';
import {createTestRunner} from '../../../src/components/tests-manager/runner/createTestRunner';
import {deriveRows} from '../../../src/components/tests-manager/model/rows';
import {matches} from '../../../src/components/tests-manager/model/values';
import type {TestSubject} from '../../../src/components/tests-manager/tests-manager-types';
import {
    LOAN_ORIGINATION_DOCUMENTATION,
    LOAN_ORIGINATION_DSL,
    LOAN_ORIGINATION_FLOW,
    LOAN_ORIGINATION_PROJECT,
} from '..';

interface Applicant {
    name: string;
    birthDate: string;
    employment: string;
    yearsEmployed: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlyDebtPayments: number;
    bureauScore: number;
    delinquencies: number;
}

interface Bin {
    characteristic: string;
    attribute: string;
    points: number;
}

interface Scorecard {
    record: {data: Applicant; age: number; disposableIncome: number};
    bins: Bin[];
    score: number;
    grade: {grade: string; probabilityOfDefault: number};
}

interface Origination {
    record: {ltv: number; householdIncome: number; householdDebtPayments: number};
    applicants: {scorecard: Scorecard; policy: {failed: string[]; allPassed: boolean}}[];
    householdScore: number;
    grade: {grade: string};
    knockouts: string[];
    rate: number;
    affordability: {payment: number; stressedPayment: number; dsti: number; maxLoan: number};
    decision: {outcome: string; reason: string};
    offer: {amount: number; rate: number; monthlyPayment: number; maxAmount: number; counterOfferAmount: number};
}

const RULESETS = new Set(['applicantScorecard', 'riskGrade', 'pricingGrid', 'decisionMatrix']);

const JONAS: Applicant = {
    name: 'Jonas Petraitis',
    birthDate: '1988-04-12',
    employment: 'permanent',
    yearsEmployed: 8,
    monthlyIncome: 4200,
    monthlyExpenses: 1300,
    monthlyDebtPayments: 250,
    bureauScore: 765,
    delinquencies: 0,
};
const IEVA: Applicant = {
    name: 'Ieva Petraitiene',
    birthDate: '1990-09-30',
    employment: 'contract',
    yearsEmployed: 3,
    monthlyIncome: 2600,
    monthlyExpenses: 900,
    monthlyDebtPayments: 0,
    bureauScore: 702,
    delinquencies: 1,
};
const LOAN = {applicationDate: '2026-10-01', loanAmount: 240000, propertyValue: 320000, termYears: 25};

function engine() {
    const service = MutableDecisionService.fromCode(LOAN_ORIGINATION_DSL);
    service.link();
    return service;
}

async function originate(overrides: Partial<typeof LOAN>, applicants: Applicant[]): Promise<Origination> {
    return (await engine().execute('loanOriginationDecision', {
        application: {...LOAN, ...overrides, applicants},
    })) as Origination;
}

describe('loan origination model', () => {
    it('opens as a project with every slice', async () => {
        const {session} = await openFixtureProject(LOAN_ORIGINATION_PROJECT);
        expect(session.getSlice('tests').subjects).toHaveProperty('loanOriginationDecision');
        expect(Object.keys(session.getSlice('flow').layouts)).toEqual(['originationBook', 'capacityBook']);
        expect(session.engine.getCode('loanOriginationDecision')).toContain('@Service');
    });

    it('describes only paths the model has', () => {
        const service = engine();
        for (const path of Object.keys(LOAN_ORIGINATION_DOCUMENTATION.byPath)) {
            // `ALL` also reads the type definitions.
            expect(service.get(path, 'ALL'), path).not.toHaveProperty('@kind', 'error');
        }
    });

    it.each(Object.keys(LOAN_ORIGINATION_PROJECT.tests!.subjects))(
        'passes every authored test case of %s',
        async (subjectId) => {
            const {session} = await openFixtureProject(LOAN_ORIGINATION_PROJECT);
            const testCases = session.tests.forSubject(subjectId);
            const subject: TestSubject = {
                id: subjectId,
                kind: RULESETS.has(subjectId) ? 'ruleset' : 'function',
                name: subjectId,
            };
            // As the Tests view does when it opens: a row the schema does not derive stays only when it is `custom`.
            testCases.syncRows(deriveRows(session.engine as never, subject));
            await createTestRunner(session.engine as never, testCases, subject).runAll();

            const assertionRows = testCases.listRows().filter((row) => row.section === 'assertions');
            for (const testCase of testCases.listTestCases()) {
                const resultSet = testCases.getResultSet(testCase.id);
                expect(resultSet?.status, testCase.name).toBe('ok');
                for (const row of assertionRows) {
                    const expected = testCase.assertions[row.path] ?? '';
                    const actual = resultSet?.results[row.path]?.value;
                    expect(
                        matches(expected, actual, row.type),
                        `${testCase.name}: ${row.path} = ${JSON.stringify(actual)}`,
                    ).toBe(true);
                }
            }
        },
    );

    describe('applicantScorecard', () => {
        it('puts the applicant into exactly one bin of every characteristic', async () => {
            const bins = (await engine().execute('applicantScorecard', {
                age: 38,
                employment: 'permanent',
                yearsEmployed: 8,
                bureauScore: 765,
                delinquencies: 0,
            })) as Bin[];
            expect(bins.map((bin) => bin.characteristic)).toEqual([
                'Age',
                'Employment',
                'Time employed',
                'Bureau score',
                'Delinquencies',
            ]);
            expect(bins.map((bin) => bin.points)).toEqual([25, 40, 25, 55, 30]);
        });

        it.each([
            [24, 'Age', 'under 25', 10],
            [25, 'Age', '25 to 39', 25],
            [59, 'Age', '40 to 59', 35],
            [60, 'Age', '60 and over', 20],
        ])('scores the age %i as %s %s', async (age, characteristic, attribute, points) => {
            const bins = (await engine().execute('applicantScorecard', {
                age,
                employment: 'permanent',
                yearsEmployed: 8,
                bureauScore: 765,
                delinquencies: 0,
            })) as Bin[];
            expect(bins[0]).toEqual({characteristic, attribute, points});
        });

        it('gives no points to an employment type it does not know', async () => {
            const bins = (await engine().execute('applicantScorecard', {
                age: 64,
                employment: 'pensioner',
                yearsEmployed: 0,
                bureauScore: 810,
                delinquencies: 0,
            })) as Bin[];
            expect(bins[1]).toEqual({characteristic: 'Employment', attribute: 'other', points: 0});
        });
    });

    describe('loanOriginationDecision service', () => {
        it('approves the joint application, graded by the weaker applicant', async () => {
            const result = await originate({}, [JONAS, IEVA]);
            expect(result.applicants.map((applicant) => applicant.scorecard.grade.grade)).toEqual(['A', 'C']);
            expect(result.householdScore).toBe(Math.min(...result.applicants.map((a) => a.scorecard.score)));
            expect(result.grade.grade).toBe('C');
            expect(result.record).toMatchObject({ltv: 0.75, householdIncome: 6800, householdDebtPayments: 250});
            expect(result.decision.outcome).toBe('APPROVE');
            expect(result.offer).toEqual({
                amount: 240000,
                rate: 0.055,
                monthlyPayment: 1473.81,
                maxAmount: 256000,
                counterOfferAmount: 0,
            });
        });

        it('stress-tests the payment at the rate plus the buffer', async () => {
            const {rate, affordability} = await originate({}, [JONAS, IEVA]);
            expect(affordability.stressedPayment).toBeGreaterThan(affordability.payment);
            expect(affordability.dsti).toBe(Math.round(((250 + affordability.stressedPayment) / 6800) * 10000) / 10000);
            expect(rate).toBe(0.055);
        });

        it('lists every failed policy rule with the name of the applicant', async () => {
            const result = await originate({termYears: 30}, [
                {...JONAS, birthDate: '1970-01-15'},
                {...IEVA, employment: 'unemployed', delinquencies: 3},
            ]);
            expect(result.knockouts).toEqual([
                'Jonas Petraitis: AGE_AT_MATURITY',
                'Ieva Petraitiene: EMPLOYED',
                'Ieva Petraitiene: DELINQUENCIES',
            ]);
            expect(result.decision).toEqual({outcome: 'DECLINE', reason: 'A policy rule failed'});
            expect(result.offer.counterOfferAmount).toBe(0);
        });

        it('counter-offers the largest affordable loan within the LTV limit', async () => {
            const high = await originate({loanAmount: 290000}, [JONAS, IEVA]);
            expect(high.decision.outcome).toBe('REFER');
            expect(high.offer.counterOfferAmount).toBe(0.8 * 320000);

            const unaffordable = await originate({loanAmount: 300000, propertyValue: 420000, termYears: 20}, [
                {...JONAS, monthlyIncome: 3800, monthlyDebtPayments: 600},
            ]);
            expect(unaffordable.decision.outcome).toBe('DECLINE');
            expect(unaffordable.offer.counterOfferAmount).toBe(unaffordable.affordability.maxLoan);
            expect(unaffordable.offer.counterOfferAmount).toBeLessThan(300000);
        });

        it('does not counter-offer more than the requested amount', async () => {
            const result = await originate({loanAmount: 150000}, [
                {
                    ...JONAS,
                    birthDate: '2003-02-01',
                    employment: 'self-employed',
                    yearsEmployed: 1,
                    bureauScore: 690,
                    delinquencies: 1,
                },
            ]);
            expect(result.decision.outcome).toBe('REFER');
            expect(result.offer.maxAmount).toBeGreaterThan(150000);
            expect(result.offer.counterOfferAmount).toBe(0);
        });
    });

    describe('workbooks', () => {
        it('originationBook decides the same as the service on the sample application', async () => {
            const result = (await engine().execute('*')) as {
                sampleDecision: string;
                originationBook: {mainScorecard: Scorecard; coScorecard: Scorecard; origination: Origination};
            };
            const {mainScorecard, coScorecard, origination} = result.originationBook;
            expect(result.sampleDecision).toBe('APPROVE');
            expect(origination.decision.outcome).toBe('APPROVE');
            expect(mainScorecard).toEqual(origination.applicants[0]!.scorecard);
            expect(coScorecard).toEqual(origination.applicants[1]!.scorecard);
            expect(mainScorecard.bins.reduce((total, bin) => total + bin.points, 0)).toBe(mainScorecard.score);
        });

        it('capacityBook lends more over a longer term at the same payment', async () => {
            const result = (await engine().execute('*')) as {
                capacityBook: {capacity: {termYears: number; maxPayment: number; maxLoan: number}[]};
            };
            const {capacity} = result.capacityBook;
            expect(capacity.map((row) => row.termYears)).toEqual([10, 15, 20, 25, 30]);
            expect(new Set(capacity.map((row) => row.maxPayment))).toEqual(new Set([2810]));
            const loans = capacity.map((row) => row.maxLoan);
            expect(loans).toEqual([...loans].sort((a, b) => a - b));
        });

        it('wires every output and chart to a result of a workbook node', () => {
            const service = engine();
            for (const [root, layout] of Object.entries(LOAN_ORIGINATION_FLOW.layouts)) {
                for (const sink of [...layout.outputs, ...(layout.charts ?? [])]) {
                    const {node, handle} = sink.source!;
                    expect(node.startsWith(`${root}.`), sink.label).toBe(true);
                    const field = service.get(node) as {'@node'?: string; '@method'?: string};
                    expect(field['@node'], `${root} ${sink.label}`).toBe('FunctionNode');
                    const result = handle.slice('out:'.length);
                    if (result === 'result') continue;
                    const callee = field['@method']!;
                    expect(service.get(callee), `${node} ${handle}`).toHaveProperty(['@return', result]);
                }
            }
        });
    });
});
