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

// The fields of a `Client`, as rows under `prefix`.
const clientRows = (prefix: string): RowSpec[] => [
    [`${prefix}.id`, 'string'],
    [`${prefix}.name`, 'string'],
    [`${prefix}.wealth`, 'number'],
    [`${prefix}.propensity`, 'number'],
    [`${prefix}.preferredChannel`, 'string'],
    [`${prefix}.hasEmail`, 'boolean'],
    [`${prefix}.phoneConsent`, 'boolean'],
    [`${prefix}.daysSinceContact`, 'number'],
];

// Cell texts of the clients, in the order of `clientRows`.
const ANN = ['T1', 'Ann Private', '2000000', '0.6', 'call', 'true', 'true', '40'];
const ANN_NO_PHONE = ['T1', 'Ann Private', '2000000', '0.6', 'call', 'true', 'false', '40'];
const BO = ['T2', 'Bo Affluent', '120000', '0.5', 'any', 'true', 'true', '40'];
const CY = ['T3', 'Cy Mass', '30000', '0.8', 'sms', 'false', 'true', '60'];
const DI = ['T4', 'Di Premium', '400000', '0.7', 'email', 'true', 'true', '5'];

/** `tests.json` of the client outreach project: the service on four clients, the offer and the decision tables. */
export const CLIENT_OUTREACH_TESTS: TestSuitesDocument = {
    schemaVersion: 1,
    subjects: {
        contactPlan: suite(
            'contactPlan',
            [
                ['team.workers', 'number'],
                ['team.dayHours', 'number'],
                ...clientRows('clients[0]'),
                ...clientRows('clients[1]'),
                ...clientRows('clients[2]'),
                ...clientRows('clients[3]'),
            ],
            [
                ['summary.status', 'string'],
                ['summary.contacted', 'number'],
                ['summary.minutesUsed', 'number'],
                ['summary.expectedRevenue', 'number'],
                ['plan[0].action', 'string'],
                ['plan[0].startsAt', 'string'],
                ['plan[1].action', 'string'],
                ['plan[1].startsAt', 'string'],
                ['plan[2].action', 'string'],
                ['plan[2].startsAt', 'string'],
                ['plan[3].action', 'string'],
                ['plan[3].reason', 'string'],
            ],
            [
                [
                    'One worker, one hour: a call, an email and an SMS',
                    ['1', '1', ...ANN, ...BO, ...CY, ...DI],
                    [
                        'optimal',
                        '3',
                        '50',
                        '1022.76',
                        'call',
                        '09:00',
                        'email',
                        '09:30',
                        'sms',
                        '09:45',
                        'none',
                        'Not contactable: COOLING_OFF',
                    ],
                ],
                [
                    'One worker, two hours: everybody gets a call',
                    ['1', '2', ...ANN, ...BO, ...CY, ...DI],
                    [
                        'optimal',
                        '3',
                        '90',
                        '1060.9',
                        'call',
                        '09:00',
                        'call',
                        '09:30',
                        'call',
                        '10:00',
                        'none',
                        'Not contactable: COOLING_OFF',
                    ],
                ],
                [
                    'No phone consent: the private client gets an email',
                    ['1', '1', ...ANN_NO_PHONE, ...BO, ...CY, ...DI],
                    [
                        'optimal',
                        '3',
                        '50',
                        '358.76',
                        'email',
                        '09:30',
                        'call',
                        '09:00',
                        'sms',
                        '09:45',
                        'none',
                        'Not contactable: COOLING_OFF',
                    ],
                ],
            ],
        ),
        channelOffer: suite(
            'channelOffer',
            [...clientRows('client'), ['tier', 'string'], ['channel', 'string']],
            [
                ['fit', 'number'],
                ['allowed', 'boolean'],
                ['probability', 'number'],
                ['value', 'number'],
            ],
            [
                ['Private client, preferred call', [...ANN, 'private', 'call'], ['1.5', 'true', '0.225', '956.25']],
                ['Private client, SMS is blocked', [...ANN, 'private', 'sms'], ['0.7', 'false', '0.0336', '0']],
                ['Affluent client, any channel', [...BO, 'affluent', 'email'], ['1', 'true', '0.075', '36.75']],
            ],
        ),
        wealthTier: suite(
            'wealthTier',
            [['wealth', 'number']],
            [['tier', 'string']],
            [
                ['Millionaire', ['2500000'], ['private']],
                ['Lowest private', ['1000000'], ['private']],
                ['Highest premium', ['999999'], ['premium']],
                ['Lowest premium', ['250000'], ['premium']],
                ['Lowest affluent', ['50000'], ['affluent']],
                ['Below every band', ['49999'], ['mass']],
            ],
        ),
        channelTerms: suite(
            'channelTerms',
            [['channel', 'string']],
            [
                ['minutes', 'number'],
                ['lift', 'number'],
            ],
            [
                ['Call', ['call'], ['30', '0.25']],
                ['Email', ['email'], ['15', '0.15']],
                ['SMS', ['sms'], ['5', '0.08']],
                ['Unknown channel', ['fax'], ['0', '0']],
            ],
        ),
        preferenceFit: suite(
            'preferenceFit',
            [
                ['preferred', 'string'],
                ['channel', 'string'],
            ],
            [['factor', 'number']],
            [
                ['Preferred channel', ['call', 'call'], ['1.5']],
                ['No preference', ['any', 'sms'], ['1']],
                ['Other channel', ['email', 'call'], ['0.7']],
            ],
        ),
        contactBlocks: suite(
            'contactBlocks',
            [
                ['channel', 'string'],
                ['tier', 'string'],
                ['phoneConsent', 'boolean'],
                ['hasEmail', 'boolean'],
                ['daysSinceContact', 'number'],
            ],
            [
                ['[0].code', 'string'],
                ['[1].code', 'string'],
                ['[2].code', 'string'],
            ],
            [
                ['Nothing blocks a call', ['call', 'premium', 'true', 'true', '30'], []],
                ['No email address', ['email', 'mass', 'true', 'false', '14'], ['NO_EMAIL']],
                [
                    'Every rule blocks an SMS',
                    ['sms', 'private', 'false', 'true', '5'],
                    ['COOLING_OFF', 'NO_PHONE_CONSENT', 'PRIVATE_NO_SMS'],
                ],
            ],
        ),
    },
};
