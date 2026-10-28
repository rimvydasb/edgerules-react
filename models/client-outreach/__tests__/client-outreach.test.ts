import 'fake-indexeddb/auto';
import highsLoader from 'highs';
import {
    mapHighsSolution,
    MutableDecisionService,
    toCplexLp,
    type HighsSolutionLike,
    type SolverHandler,
} from '@edgerules/node/mutable';
import {beforeAll, describe, expect, it} from 'vitest';
import {openFixtureProject} from '../../../src/components/project-session/testing/sessionFixture';
import {createTestRunner} from '../../../src/components/tests-manager/runner/createTestRunner';
import {deriveRows} from '../../../src/components/tests-manager/model/rows';
import {matches} from '../../../src/components/tests-manager/model/values';
import type {TestSubject} from '../../../src/components/tests-manager/tests-manager-types';
import {
    CLIENT_OUTREACH_DOCUMENTATION,
    CLIENT_OUTREACH_DSL,
    CLIENT_OUTREACH_FLOW,
    CLIENT_OUTREACH_PROJECT,
    CLIENTS,
    type Client,
} from '..';

interface PlanRow {
    clientId: string;
    name: string;
    tier: string;
    action: string;
    worker: number;
    startsAt: string;
    minutes: number;
    expectedValue: number;
    reason: string;
}

interface Task {
    clientId: string;
    channel: string;
    minutes: number;
    worker: number;
    startMinute: number;
    startsAt: string;
}

interface Outreach {
    records: {data: Client; tier: string; segment: string}[];
    segments: Record<string, {clients: number}>;
    mix: Record<string, number | string> & {status: string; objective: number};
    plan: PlanRow[];
    schedule: Task[];
    byChannel: {channel: string; clients: number; minutes: number; expectedValue: number}[];
    byTier: {tier: string; calls: number; emails: number; sms: number; none: number}[];
    summary: {
        status: string;
        contacted: number;
        notContacted: number;
        minutesUsed: number;
        minutesAvailable: number;
        expectedRevenue: number;
        plannedRevenue: number;
    };
}

const RULESETS = new Set(['wealthTier', 'channelTerms', 'preferenceFit', 'contactBlocks']);
const TEAM = {workers: 2, dayHours: 7};

let solver: SolverHandler;
beforeAll(async () => {
    const highs = await highsLoader();
    solver = (problem) => mapHighsSolution(highs.solve(toCplexLp(problem)) as unknown as HighsSolutionLike, problem);
});

function engine() {
    const service = MutableDecisionService.fromCode(CLIENT_OUTREACH_DSL);
    service.link();
    service.registerSolver(solver, {name: 'highs-js'});
    return service;
}

async function plan(clients: Client[] = CLIENTS, team = TEAM): Promise<Outreach> {
    return (await engine().execute('contactPlan', {clients, team})) as Outreach;
}

// The solver's count of a channel in a segment: `premiumFullCalls` for `premium-full` and `call`.
function solverCount(mix: Outreach['mix'], segment: string, channel: string): number {
    const [tier, reach] = segment.split('-') as [string, string];
    const suffix = {call: 'Calls', email: 'Emails', sms: 'Sms'}[channel]!;
    const name = `${tier}${reach[0]!.toUpperCase()}${reach.slice(1)}${suffix}`;
    return (mix[name] as number | undefined) ?? 0;
}

describe('client outreach model', () => {
    it('opens as a project with every slice', async () => {
        const {session} = await openFixtureProject(CLIENT_OUTREACH_PROJECT);
        expect(session.getSlice('tests').subjects).toHaveProperty('contactPlan');
        expect(Object.keys(session.getSlice('flow').layouts)).toEqual(['outreachBook']);
        expect(session.engine.getCode('contactPlan')).toContain('@Service');
        expect(session.engine.requiresSolver()).toBe(true);
    });

    it('describes only paths the model has', () => {
        const service = engine();
        for (const path of Object.keys(CLIENT_OUTREACH_DOCUMENTATION.byPath)) {
            // `ALL` also reads the type definitions.
            expect(service.get(path, 'ALL'), path).not.toHaveProperty('@kind', 'error');
        }
    });

    it.each(Object.keys(CLIENT_OUTREACH_PROJECT.tests!.subjects))(
        'passes every authored test case of %s',
        async (subjectId) => {
            const {session} = await openFixtureProject(CLIENT_OUTREACH_PROJECT);
            session.engine.registerSolver(solver, {name: 'highs-js'});
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
            expect(assertionRows.length).toBeGreaterThan(0);
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

    describe('contactPlan service on the 100 sample clients', () => {
        it('spends the whole day of both workers on the best mix of channels', async () => {
            const {summary, byChannel, byTier} = await plan();
            expect(summary).toEqual({
                status: 'optimal',
                contacted: 53,
                notContacted: 47,
                minutesUsed: 840,
                minutesAvailable: 840,
                expectedRevenue: 8516.05,
                plannedRevenue: 8494.77,
            });
            expect(byChannel.map(({channel, clients, minutes}) => [channel, clients, minutes])).toEqual([
                ['call', 19, 570],
                ['email', 10, 150],
                ['sms', 24, 120],
            ]);
            expect(byTier).toEqual([
                {tier: 'private', calls: 6, emails: 1, sms: 0, none: 1},
                {tier: 'premium', calls: 11, emails: 2, sms: 3, none: 1},
                {tier: 'affluent', calls: 2, emails: 7, sms: 20, none: 6},
                {tier: 'mass', calls: 0, emails: 0, sms: 1, none: 39},
            ]);
        });

        it('returns one row for every client, in the input order', async () => {
            const result = await plan();
            expect(result.plan.map((row) => row.clientId)).toEqual(CLIENTS.map((client) => client.id));
            for (const row of result.plan) {
                if (row.action === 'none') {
                    expect(row, row.clientId).toMatchObject({worker: 0, startsAt: '', minutes: 0, expectedValue: 0});
                    expect(row.reason).toMatch(/^Not (contactable|selected)/);
                } else {
                    expect(row.worker, row.clientId).toBeGreaterThan(0);
                    expect(row.startsAt).toMatch(/^\d\d:\d\d$/);
                    expect(row.reason).toMatch(/^Selected/);
                }
            }
        });

        it('gives out exactly the counts of the solver in every segment', async () => {
            const {records, plan: rows, mix} = await plan();
            for (const segment of new Set(records.map((record) => record.segment))) {
                if (segment.endsWith('-none')) continue;
                for (const channel of ['call', 'email', 'sms']) {
                    const given = rows.filter((row, i) => records[i]!.segment === segment && row.action === channel);
                    expect(given.length, `${segment} ${channel}`).toBe(solverCount(mix, segment, channel));
                }
            }
        });

        it('never breaks the contact policy', async () => {
            const result = await plan();
            result.plan.forEach((row, i) => {
                const client = CLIENTS[i]!;
                if (client.daysSinceContact < 14) expect(row.action, client.id).toBe('none');
                if (!client.phoneConsent) expect(['call', 'sms'], client.id).not.toContain(row.action);
                if (!client.hasEmail) expect(row.action, client.id).not.toBe('email');
                if (row.tier === 'private') expect(row.action, client.id).not.toBe('sms');
            });
            expect(result.plan.filter((row) => row.action === 'sms').length).toBeLessThanOrEqual(40);
        });

        it('schedules every worker without overlaps within the working day', async () => {
            const {schedule} = await plan();
            for (const worker of [1, 2]) {
                const tasks = schedule.filter((task) => task.worker === worker);
                let free = 0;
                for (const task of tasks) {
                    expect(task.startMinute, task.clientId).toBe(free);
                    free += task.minutes;
                }
                expect(free).toBe(420);
            }
            expect(schedule[0]).toMatchObject({channel: 'call', startMinute: 0, startsAt: '09:00'});
            expect(schedule.at(-1)).toMatchObject({channel: 'sms', startsAt: '15:55'});
        });

        it('adds the cooling-off client back when the last contact is old enough', async () => {
            const cooling = CLIENTS.filter((client) => client.daysSinceContact < 14);
            const rested = CLIENTS.map((client) =>
                client.daysSinceContact < 14 ? {...client, daysSinceContact: 14} : client,
            );
            const before = await plan();
            const after = await plan(rested);
            expect(cooling.length).toBeGreaterThan(0);
            expect(after.summary.expectedRevenue).toBeGreaterThan(before.summary.expectedRevenue);
        });
    });

    describe('workbook', () => {
        it('outreachBook plans the same day as the service', async () => {
            const result = (await engine().execute('outreachBook')) as {outreach: Outreach};
            const service = await plan();
            expect(result.outreach.summary).toEqual(service.summary);
            expect(result.outreach.plan).toEqual(service.plan);
        });

        it('wires every output and chart to a result of a workbook node', () => {
            const service = engine();
            for (const [root, layout] of Object.entries(CLIENT_OUTREACH_FLOW.layouts)) {
                for (const sink of [...layout.outputs, ...(layout.charts ?? [])]) {
                    const {node, handle} = sink.source!;
                    expect(node.startsWith(`${root}.`), sink.label).toBe(true);
                    const field = service.get(node) as {'@node'?: string; '@method'?: string};
                    expect(field['@node'], `${root} ${sink.label}`).toBe('FunctionNode');
                    const result = handle.slice('out:'.length);
                    const callee = field['@method']!;
                    expect(service.get(callee), `${node} ${handle}`).toHaveProperty(['@return', result]);
                }
            }
        });
    });
});
