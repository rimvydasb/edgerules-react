import 'fake-indexeddb/auto';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it} from 'vitest';
import {openFixtureProject} from '../../../src/components/project-session/testing/sessionFixture';
import {createTestRunner} from '../../../src/components/tests-manager/runner/createTestRunner';
import {matches} from '../../../src/components/tests-manager/model/values';
import {LOAN_REPAYMENT_DOCUMENTATION, LOAN_REPAYMENT_DSL, LOAN_REPAYMENT_FLOW, LOAN_REPAYMENT_PROJECT} from '..';

interface Installment {
    period: number;
    payment: number;
    interest: number;
    principal: number;
    balance: number;
}

interface Repayment {
    pricing: {tier: string; premium: number; approved: boolean};
    rate: number;
    payment: number;
    schedule: Installment[];
    cost: {totalInterest: number; totalPaid: number};
}

function engine() {
    const service = MutableDecisionService.fromCode(LOAN_REPAYMENT_DSL);
    service.link();
    return service;
}

async function repay(amount: number, years: number, creditScore: number): Promise<Repayment> {
    return (await engine().execute('loanRepayment', {request: {amount, years, creditScore}})) as Repayment;
}

// Sums in cents, so the totals compare exactly.
function cents(values: number[]): number {
    return values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
}

describe('loan repayment model', () => {
    it('opens as a project with every slice', async () => {
        const {session} = await openFixtureProject(LOAN_REPAYMENT_PROJECT);
        expect(session.getSlice('tests').subjects).toHaveProperty('loanRepayment');
        expect(Object.keys(session.getSlice('flow').layouts)).toEqual(['mortgageBook', 'termComparisonBook']);
        expect(session.engine.getCode('loanRepayment')).toContain('@Service');
    });

    it('describes only paths the model has', () => {
        const service = engine();
        for (const path of Object.keys(LOAN_REPAYMENT_DOCUMENTATION.byPath)) {
            // `ALL` also reads the type definitions.
            expect(service.get(path, 'ALL'), path).not.toHaveProperty('@kind', 'error');
        }
    });

    it.each(Object.keys(LOAN_REPAYMENT_PROJECT.tests!.subjects))(
        'passes every authored test case of %s',
        async (subjectId) => {
            const {session} = await openFixtureProject(LOAN_REPAYMENT_PROJECT);
            const testCases = session.tests.forSubject(subjectId);
            const kind = subjectId === 'pricingTier' ? 'ruleset' : 'function';
            await createTestRunner(session.engine as never, testCases, {id: subjectId, kind, name: subjectId}).runAll();

            const assertionRows = testCases.listRows().filter((row) => row.section === 'assertions');
            for (const testCase of testCases.listTestCases()) {
                const resultSet = testCases.getResultSet(testCase.id);
                expect(resultSet?.status, testCase.name).toBe('ok');
                for (const row of assertionRows) {
                    const expected = testCase.assertions[row.path] ?? '';
                    const actual = resultSet?.results[row.path]?.value;
                    expect(
                        matches(expected, actual, row.type),
                        `${testCase.name}: ${row.path} = ${String(actual)}`,
                    ).toBe(true);
                }
            }
        },
    );

    describe('pricingTier decision table', () => {
        it.each([
            [800, 10, 'prime', 0.005],
            [760, 15, 'prime', 0.005],
            [760, 16, 'prime', 0.0075],
            [759, 30, 'standard', 0.015],
            [680, 30, 'standard', 0.015],
            [679, 10, 'near-prime', 0.03],
            [600, 10, 'near-prime', 0.03],
            [600, 11, 'declined', 0],
            [599, 5, 'declined', 0],
        ])('prices credit score %i over %i years as %s', async (creditScore, years, tier, premium) => {
            const result = await engine().execute('pricingTier', {creditScore, years});
            expect(result).toEqual({tier, premium, approved: tier !== 'declined'});
        });
    });

    describe('loanRepayment service', () => {
        it.each([
            [250000, 25, 780],
            [180000, 30, 720],
            [15000, 8, 640],
        ])('repays %i over %i years to the cent', async (amount, years, creditScore) => {
            const {schedule, payment, cost} = await repay(amount, years, creditScore);

            expect(schedule).toHaveLength(years * 12);
            expect(schedule.map((installment) => installment.period)).toEqual(schedule.map((_, index) => index + 1));
            expect(cents(schedule.map((installment) => installment.principal))).toBe(amount);
            expect(schedule.at(-1)!.balance).toBe(0);
            // Every installment pays the annuity; the last one settles the rounding remainder.
            expect(schedule.slice(0, -1).every((installment) => installment.payment === payment)).toBe(true);
            expect(Math.abs(schedule.at(-1)!.payment - payment)).toBeLessThan(5);
            expect(cost.totalInterest).toBe(cents(schedule.map((installment) => installment.interest)));
            expect(cost.totalPaid).toBe(cents([amount, cost.totalInterest]));
        });

        it('returns only the values of its result', async () => {
            const result = await repay(20000, 5, 700);
            // `annuity` and `fullSchedule` are steps of the body, not part of the result.
            expect(Object.keys(result)).toEqual(['pricing', 'rate', 'payment', 'schedule', 'cost']);
        });

        it('returns an empty schedule for a declined request', async () => {
            const result = await repay(20000, 5, 550);
            expect(result).toMatchObject({pricing: {approved: false}, payment: 0, schedule: []});
            expect(result.cost).toEqual({totalInterest: 0, totalPaid: 0});
        });

        it('charges less interest over a shorter term', async () => {
            const shorter = await repay(180000, 15, 720);
            const longer = await repay(180000, 30, 720);
            expect(shorter.payment).toBeGreaterThan(longer.payment);
            expect(shorter.cost.totalInterest).toBeLessThan(longer.cost.totalInterest);
        });
    });

    describe('workbooks', () => {
        it('mortgageBook splits each year of the mortgage schedule', async () => {
            const result = (await engine().execute('*')) as {
                mortgageBook: {
                    repayment: Repayment;
                    yearly: {year: number; interest: number; principal: number; balance: number}[];
                };
            };
            const {repayment, yearly} = result.mortgageBook;
            expect(repayment.payment).toBe(1354.35);
            expect(yearly).toHaveLength(25);
            expect(yearly.map((row) => row.year)).toEqual(yearly.map((_, index) => index + 1));
            expect(cents(yearly.map((row) => row.principal))).toBe(250000);
            expect(cents(yearly.map((row) => row.interest))).toBe(repayment.cost.totalInterest);
            expect(yearly[0]!.balance).toBe(repayment.schedule[11]!.balance);
            expect(yearly.at(-1)!.balance).toBe(0);
        });

        it('termComparisonBook reads the balance of both plans at the end of each year', async () => {
            const result = (await engine().execute('*')) as {
                termComparisonBook: {
                    shortPlan: Repayment;
                    longPlan: Repayment;
                    comparison: {year: number; shorterBalance: number; longerBalance: number}[];
                };
            };
            const {shortPlan, longPlan, comparison} = result.termComparisonBook;
            expect(comparison).toHaveLength(30);
            expect(comparison[0]).toEqual({
                year: 1,
                shorterBalance: shortPlan.schedule[11]!.balance,
                longerBalance: longPlan.schedule[11]!.balance,
            });
            expect(comparison[14]!.shorterBalance).toBe(0);
            expect(comparison.slice(15).every((row) => row.shorterBalance === 0)).toBe(true);
            expect(comparison.at(-1)!.longerBalance).toBe(0);
        });

        it('wires every output and chart to a result of a workbook node', () => {
            const service = engine();
            for (const [root, layout] of Object.entries(LOAN_REPAYMENT_FLOW.layouts)) {
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
