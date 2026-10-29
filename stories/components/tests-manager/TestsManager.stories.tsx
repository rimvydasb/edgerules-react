import type {ReactElement} from 'react';
import {Box, Button, Text} from '@mantine/core';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {
    ProjectProvider,
    useProjectSession,
    useProjectSlice,
    type ProjectSession,
} from '../../../src/components/project-session';
import {TestsManager} from '../../../src/components/tests-manager';
import type {TestsManagerProps} from '../../../src/components/tests-manager';
import {openStoryProject} from '../../support/storyProject';

const WORKBOOK_MODEL = `{
    maxLimit: 10000,
    name: <string, required: true>,
    age: <number, required: true>,
    credit: {
        balance: <number, required: true>,
        limit: <number, required: true>
    },
    creditDecision: {
        approved: if credit.balance >= 0 and age > 17 then true else false,
        limit: if approved then maxLimit else 0
    }
}`;

const DECISION_SERVICE_MODEL = `{
    func isEligible(age: number): age >= 18
    ruleset risk(age: number): {
        hitPolicy: "first-match"
        rules: [
            { when: { age: 18..25 }, then: { level: "high", limit: 1000 } }
            { when: { age: > 25 }, then: { level: "low", limit: 20000 } }
        ]
        default: { level: "none", limit: 0 }
    }
    library: {
        func eligibility(age: number, income: number): { ok: age >= 18 and income >= 1000 }
    }
    loop amortize(principal: number, payment: number): {
        state: { balance: principal, months: 0 }
        while: state.balance > 0
        maxIterations: 600
        do: { balance: state.balance - payment, months: state.months + 1 }
        return: { months: state.months }
    }
    func untypedExample(x): x + 1
}`;

const ARRAY_MODEL = `{
    type CreditLine: {
        balance: <number, required: true>
        limit: <number, required: true>
    }
    type Applicant: {
        name: <string, required: true>
        creditLine: <CreditLine[]>
    }
    application: {
        applicant: <Applicant[]>
        reference: <string>
    }
    totals: {
        applicants: count(application.applicant)
        firstBalance: application.applicant[0].creditLine[0].balance
    }
}`;

const OPTIMISE_MODEL = `{
    optimise factoryProduction(workers: number, sticks: number, plates: number): {
        bottlenecks: true
        variables: {
            chairs: <number, integer: true, min: 0>
            tables: <number, integer: true, min: 0>
        }
        maximise: 15 * chairs + 40 * tables
        constraints: {
            workerCapacity: 1 * chairs + 3 * tables <= workers
            stickSupply: 4 * chairs + 4 * tables <= sticks
            plateSupply: 1 * chairs + 2 * tables <= plates
        }
        timeLimit: 1000
    }
}`;

// A story's project session: TestsManager reads the engine facade, the session's tests and its descriptions.
function ProjectTestsManager({
    session,
    ...props
}: {session: ProjectSession} & Omit<TestsManagerProps, 'service' | 'testCases' | 'modelName'>): ReactElement {
    return (
        <TestsManager
            service={session.engine}
            testCases={session.tests}
            documentationService={session.documentation}
            {...props}
        />
    );
}

interface WorkbookArgs {
    readOnly?: boolean;
    pageSize?: number; // test-case columns per page; the Path and Description columns stay frozen
}

// "Add bonus field" edits the model through the session engine. The model slice version is the `revision`, so every
// case re-runs on a model edit.
function WorkbookHarness({readOnly, pageSize}: WorkbookArgs): ReactElement {
    const session = useProjectSession();
    const model = useProjectSlice('model');

    return (
        <Box maw={1100}>
            <Text size="sm" mb="xs">
                Type values into Inputs, then use a row&apos;s three-dots menu to &quot;Move to Assertions&quot; and
                edit the expected value to see the mismatch highlight.
            </Text>
            <ProjectTestsManager session={session} revision={model.version} readOnly={readOnly} pageSize={pageSize} />
            <Text size="sm" mt="md" mb="xs">
                &quot;Add bonus field&quot; edits the model (version <code>{model.version}</code>): every case re-runs
                and the new field appears in Validations. Set <code>pageSize</code> and add cases with the header&apos;s
                + button to page the test-case columns.
            </Text>
            <Button
                size="compact-sm"
                variant="subtle"
                mr="xs"
                onClick={() => session.engine.set('bonus', {'@kind': 'expression', expression: '5'})}
            >
                Add bonus field
            </Button>
            <Button size="compact-sm" variant="subtle" onClick={() => session.engine.remove('bonus')}>
                Remove bonus field
            </Button>
        </Box>
    );
}

const meta: Meta<typeof TestsManager> = {
    title: 'Components/Tests Manager',
    component: TestsManager,
    parameters: {
        docs: {
            description: {
                component:
                    'Maintains test cases for a model: Inputs / Assertions / Validations sections, ' +
                    'per-column pass counters, and a run engine driven by TestRunner against a real ' +
                    'MutableDecisionService.',
            },
        },
    },
};

export default meta;

type Story = StoryObj<typeof TestsManager>;

/** The tests of a model, over a live project session. The controls make it read-only or page its columns. */
export const Workbook: StoryObj<WorkbookArgs> = {
    args: {readOnly: false},
    argTypes: {pageSize: {control: {type: 'number', min: 1}}},
    loaders: [
        async () => {
            return {session: await openStoryProject(WORKBOOK_MODEL)};
        },
    ],
    render: (args, {loaded}) => (
        <ProjectProvider session={loaded.session as ProjectSession}>
            <WorkbookHarness {...args} />
        </ProjectProvider>
    ),
};

export const DecisionServiceEntryPoints: Story = {
    loaders: [
        async () => {
            return {session: await openStoryProject(DECISION_SERVICE_MODEL)};
        },
    ],
    render: (_args, {loaded}) => {
        const {session} = loaded as {session: ProjectSession};
        return (
            <Box maw={1100}>
                <Text size="sm" mb="xs">
                    The subject drop-down lists the model, a root <code>func</code>, a <code>ruleset</code>, a nested{' '}
                    <code>library.eligibility</code>, and a <code>loop</code>. <code>untypedExample</code> is declared
                    but has an untyped parameter, so it never appears as a subject.
                </Text>
                <ProjectTestsManager session={session} subjectId="isEligible" />
            </Box>
        );
    },
};

export const OptimiseWithSolver: Story = {
    loaders: [
        async () => {
            const session = await openStoryProject(OPTIMISE_MODEL);
            session.engine.registerSolver(
                () => ({
                    status: 'optimal',
                    objective: 120,
                    values: {chairs: 8, tables: 0},
                }),
                {name: 'story-stub', version: '1.0'},
            );
            return {session};
        },
    ],
    render: (_args, {loaded}) => {
        const {session} = loaded as {session: ProjectSession};
        return (
            <Box maw={1100}>
                <Text size="sm" mb="xs">
                    Solver registered by this story&apos;s own loader (EdgeRules ships none). Enter <code>workers</code>
                    /<code>sticks</code>/<code>plates</code> to see the result record: status, objective, the decision
                    variables, and <code>bottlenecks.*</code>.
                </Text>
                <ProjectTestsManager session={session} subjectId="factoryProduction" />
            </Box>
        );
    },
};

export const OptimiseWithoutSolver: Story = {
    loaders: [
        async () => {
            return {session: await openStoryProject(OPTIMISE_MODEL)};
        },
    ],
    render: (_args, {loaded}) => {
        const {session} = loaded as {session: ProjectSession};
        return (
            <Box maw={1100}>
                <Text size="sm" mb="xs">
                    No solver registered — the pre-flight banner appears instead of a per-cell failure.
                </Text>
                <ProjectTestsManager session={session} subjectId="factoryProduction" />
            </Box>
        );
    },
};

export const IndexedArrayPaths: Story = {
    loaders: [
        async () => {
            return {session: await openStoryProject(ARRAY_MODEL)};
        },
    ],
    render: (_args, {loaded}) => {
        const {session} = loaded as {session: ProjectSession};
        return (
            <Box maw={1100}>
                <Text size="sm" mb="xs">
                    Every array is pre-generated down to its element <code>[0]</code>, at any depth (
                    <code>application.applicant[0].creditLine[0].balance</code>
                    ). Use a row&apos;s three-dots menu to <strong>Duplicate</strong> it into the next element, and
                    click a Path cell to retype it — an unknown path turns red as you type.
                </Text>
                <ProjectTestsManager session={session} />
            </Box>
        );
    },
};
