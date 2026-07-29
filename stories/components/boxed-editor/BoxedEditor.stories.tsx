import {useEffect, useMemo, useState, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import highsLoader from 'highs';
import highsWasmUrl from 'highs/runtime?url';
import {
    init,
    mapHighsSolution,
    MutableDecisionService,
    toCplexLp,
    type HighsSolutionLike,
    type LpOutcome,
    type LpProblem,
} from '@edgerules/web/mutable';
import {BoxedEditor, createBoxedEditorService, type BoxedEditorService} from '../../../src/components/boxed-editor';
import {createDocumentationService} from '../../../src/components/documentation-service';
import {createTestCasesService} from '../../../src/components/test-cases-service';
import {
    createTestRunner,
    type MutableDecisionService as RunnerService,
    type TestSubject,
} from '../../../src/components/tests-manager';

function uniqueDbName(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const LOAN_ORIGINATION_MODEL = `{
  type Applicant: {
    name: <string, required: true>
    age: <number, required: true>
  }
  application: {
    applicationDate: <date, required: true>
    propertyValue: <number, required: true>
    loanAmount: <number, required: true>
  }
  payment: application.loanAmount / 12
}`;

// A scalar `list`, homogeneous relations, and a relation whose cell holds a complex object
// (a drill-down, rendered as nested rows rather than JSON text).
const COLLECTIONS_MODEL = `{
  reviewStages: ["Application", "Underwriting", "Credit review", "Closing"]
  applicants: [
    { reference: "LOAN-001", applicant: "Ada L.", amount: 320000 }
    { reference: "LOAN-002", applicant: "Grace H.", amount: 0 }
  ]
  offices: [
    { id: 1, address: { city: "Vilnius", zip: "01001" } }
    { id: 2, address: { city: "Kaunas", zip: "44001" } }
  ]
}`;

const LARGE_MODEL = `{ ${Array.from({length: 200}, (_, index) => `value${index}: ${index}`).join(' ')} }`;

async function buildService(code: string) {
    await init();
    return createBoxedEditorService(MutableDecisionService.fromCode(code));
}

/** Renders the editor plus a caption reflecting the live committed model, so a story can show
 * `onChange` actually firing once per successful edit (never on a rejected one). */
function EditableHarness({
    service,
    path,
    readOnly = false,
}: {
    service: BoxedEditorService;
    path: string;
    readOnly?: boolean;
}): ReactElement {
    const [changeCount, setChangeCount] = useState(0);
    const payment = service.getBoxedRowData('payment')?.value ?? '(not in this model)';

    return (
        <Box sx={{width: 'fit-content'}}>
            <BoxedEditor
                service={service}
                path={path}
                languageService={MutableDecisionService}
                readOnly={readOnly}
                onChange={() => setChangeCount((current) => current + 1)}
            />
            <Typography variant="caption" data-testid="live-payment" sx={{display: 'block', mt: 1}}>
                payment (committed): {payment}
            </Typography>
            <Typography variant="caption" data-testid="boxed-change-count" sx={{display: 'block'}}>
                Changes: {changeCount}
            </Typography>
        </Box>
    );
}

async function buildServiceWithMutable(code: string) {
    await init();
    const mutable = MutableDecisionService.fromCode(code);
    return {service: createBoxedEditorService(mutable), mutable};
}

type ExecutingFixture = Awaited<ReturnType<typeof buildServiceWithMutable>>;

function errorText(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null) {
        try {
            return JSON.stringify(error);
        } catch {
            // Fall through for non-serializable host errors.
        }
    }
    return String(error);
}

/**
 * Renders the real mutable engine alongside the editor. `execute()` is async, so browser tests
 * must assert `live-result` with Playwright's auto-retrying `toHaveText`, never a one-shot read.
 */
function ExecutingHarness({
    service,
    mutable,
    path = '*',
    method = '*',
    input,
    documentationService,
    readOnly = false,
    allowReadOnlyToggle = false,
}: ExecutingFixture & {
    path?: string;
    method?: string;
    input?: Record<string, unknown>;
    documentationService?: ReturnType<typeof createDocumentationService>;
    readOnly?: boolean;
    allowReadOnlyToggle?: boolean;
}): ReactElement {
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState('loading');
    const [viewerReadOnly, setViewerReadOnly] = useState(readOnly);

    useEffect(() => {
        let current = true;
        setResult('loading');
        mutable.execute(method, input).then(
            (value) => {
                if (current) setResult(JSON.stringify(value));
            },
            (error: unknown) => {
                if (current) setResult(`error: ${errorText(error)}`);
            },
        );
        return () => {
            current = false;
        };
    }, [mutable, method, input, revision]);

    return (
        <Box sx={{width: 'fit-content'}}>
            {allowReadOnlyToggle && (
                <button
                    type="button"
                    data-testid="toggle-read-only"
                    onClick={() => setViewerReadOnly((current) => !current)}
                >
                    {viewerReadOnly ? 'Resume editing' : 'Reviewer mode'}
                </button>
            )}
            <BoxedEditor
                service={service}
                path={path}
                languageService={MutableDecisionService}
                documentationService={documentationService}
                readOnly={viewerReadOnly}
                onChange={() => setRevision((current) => current + 1)}
            />
            <Typography variant="caption" data-testid="live-result" sx={{display: 'block', mt: 1}}>
                {result}
            </Typography>
            <Typography variant="caption" data-testid="live-model" sx={{display: 'block'}}>
                {JSON.stringify(service.toPortable())}
            </Typography>
            <Typography variant="caption" data-testid="boxed-change-count" sx={{display: 'block'}}>
                Changes: {revision}
            </Typography>
        </Box>
    );
}

async function buildExecutingService(code: string, withSolver = false): Promise<ExecutingFixture> {
    const fixture = await buildServiceWithMutable(code);
    if (withSolver) {
        const highs = await highsLoader({locateFile: () => highsWasmUrl});
        fixture.mutable.registerSolver(
            (problem: LpProblem): LpOutcome => {
                const text = toCplexLp(problem);
                const options = problem.timeLimit === undefined ? {} : {time_limit: problem.timeLimit / 1000};
                return mapHighsSolution(highs.solve(text, options) as unknown as HighsSolutionLike, problem);
            },
            {name: 'highs-js'},
        );
    }
    return fixture;
}

const MODEL_SUBJECT: TestSubject = {id: '*', kind: 'model', name: 'Model'};

/**
 * Wires a `TestCasesService` + `TestRunner` exactly as a host would — `testRunner` memoized on
 * `[mutable, testCasesService, subject, revision]` and `revision` bumped from `onChange`, so
 * editing any row re-runs the *selected* case (debounced ~300 ms); the other case goes stale
 * (shown italic) until navigated to, per Resolved Decision — Open Question #2, Option 1.
 */
function TestCasesAndTestRunnerHarness({
    service,
    mutable,
    path,
}: {
    service: BoxedEditorService;
    mutable: InstanceType<typeof MutableDecisionService>;
    path: string;
}): ReactElement {
    const [revision, setRevision] = useState(0);
    const testCasesService = useMemo(() => createTestCasesService(uniqueDbName('boxed-editor-story'), '*'), []);
    const testRunner = useMemo(
        () =>
            createTestRunner(mutable as unknown as RunnerService, testCasesService, MODEL_SUBJECT, {
                modelRevision: String(revision),
            }),
        [mutable, testCasesService, revision],
    );

    // Seeds two test cases the first time this story mounts, against a fresh IndexedDB database.
    useEffect(() => {
        if (testCasesService.listTestCases().length > 0) return;
        testCasesService.syncRows([
            {path: 'application.loanAmount', section: 'inputs', order: 0, type: 'number', present: true},
            {path: 'application.propertyValue', section: 'inputs', order: 1, type: 'number', present: true},
            {
                path: 'application.applicationDate',
                section: 'inputs',
                order: 2,
                type: 'date',
                present: true,
            },
        ]);
        const small = testCasesService.addTestCase('Small loan');
        testCasesService.setCell(small.id, 'application.loanAmount', 'input', '80000');
        testCasesService.setCell(small.id, 'application.propertyValue', 'input', '100000');
        testCasesService.setCell(small.id, 'application.applicationDate', 'input', '"2024-01-01"');
        const large = testCasesService.addTestCase('Large loan');
        testCasesService.setCell(large.id, 'application.loanAmount', 'input', '250000');
        testCasesService.setCell(large.id, 'application.propertyValue', 'input', '320000');
        testCasesService.setCell(large.id, 'application.applicationDate', 'input', '"2024-06-15"');
        // Unparseable for a `number` row — a real `CellParseError`, caught before `execute()` is even
        // called, surfaces as a run-level failure (header chip, every cell blank), never a per-row one.
        const invalid = testCasesService.addTestCase('Invalid input');
        testCasesService.setCell(invalid.id, 'application.loanAmount', 'input', 'not-a-number');
        testCasesService.setCell(invalid.id, 'application.propertyValue', 'input', '320000');
        testCasesService.setCell(invalid.id, 'application.applicationDate', 'input', '"2024-06-15"');
    }, [testCasesService]);

    return (
        <BoxedEditor
            service={service}
            path={path}
            languageService={MutableDecisionService}
            testCasesService={testCasesService}
            testRunner={testRunner}
            testSubjectId="*"
            revision={revision}
            onChange={() => setRevision((current) => current + 1)}
        />
    );
}

const meta: Meta<typeof BoxedEditor> = {
    title: 'Boxed Editor/BoxedEditor',
    component: BoxedEditor,
    parameters: {
        docs: {
            description: {
                component:
                    'Structured authoring surface for EdgeRules models: a single flat treegrid of rows ' +
                    'over a `BoxedEditorService` facade, backed by the real `@edgerules/web`/`@edgerules/node` ' +
                    'engine — no rule-evaluation logic of its own. Click a `field` row’s value to swap in a ' +
                    'model-scoped CodeMirror editor (Enter/blur commits, Escape reverts, `onChange` fires ' +
                    'once per successful commit); every appendable container renders a trailing "(new …)" ' +
                    'placeholder to append without opening a menu; a row’s three-dots menu adds the rest ' +
                    '(rename, duplicate, delete, and construct-specific actions for `function`/`ruleset`/' +
                    '`optimise`).',
            },
        },
    },
};
export default meta;
type Story = StoryObj<typeof BoxedEditor>;

export const RootModel: Story = {
    loaders: [async () => ({service: await buildService(LOAN_ORIGINATION_MODEL)})],
    render: (args, {loaded}) => (
        <BoxedEditor {...args} service={loaded.service} path="*" languageService={MutableDecisionService} />
    ),
};

export const EditableExpression: Story = {
    loaders: [async () => ({service: await buildService(LOAN_ORIGINATION_MODEL)})],
    render: (_args, {loaded}) => <EditableHarness service={loaded.service} path="*" />,
};

export const BlankModel: Story = {
    loaders: [async () => buildExecutingService('{}')],
    render: (_args, {loaded}) => (
        <ExecutingHarness service={loaded.service} mutable={loaded.mutable} allowReadOnlyToggle />
    ),
};

export const FocusedContext: Story = {
    loaders: [async () => ({service: await buildService(LOAN_ORIGINATION_MODEL)})],
    render: (args, {loaded}) => (
        <BoxedEditor {...args} service={loaded.service} path="application" languageService={MutableDecisionService} />
    ),
};

export const ReadOnly: Story = {
    loaders: [async () => ({service: await buildService(LOAN_ORIGINATION_MODEL)})],
    render: (args, {loaded}) => (
        <BoxedEditor {...args} service={loaded.service} path="*" languageService={MutableDecisionService} readOnly />
    ),
};

export const ColumnsHidden: Story = {
    loaders: [async () => ({service: await buildService(LOAN_ORIGINATION_MODEL)})],
    render: (args, {loaded}) => (
        <BoxedEditor
            {...args}
            service={loaded.service}
            path="*"
            languageService={MutableDecisionService}
            showDescription={false}
            showTestResults={false}
        />
    ),
};

export const CollectionsListAndRelation: Story = {
    loaders: [async () => buildExecutingService(COLLECTIONS_MODEL)],
    render: (_args, {loaded}) => <ExecutingHarness service={loaded.service} mutable={loaded.mutable} />,
};

export const FatalError: Story = {
    loaders: [async () => ({service: await buildService(LOAN_ORIGINATION_MODEL)})],
    render: (args, {loaded}) => <BoxedEditor {...args} service={loaded.service} path="does.not.exist" />,
};

export const LargeModel: Story = {
    loaders: [async () => ({service: await buildService(LARGE_MODEL)})],
    render: (args, {loaded}) => <BoxedEditor {...args} service={loaded.service} path="*" readOnly />,
};

export const TestCasesAndTestRunner: Story = {
    parameters: {
        docs: {
            description: {
                story:
                    'A `TestCasesService` + `TestRunner` wired exactly as a host would, with three seeded ' +
                    "cases. Edit `application.loanAmount`'s value cell (click, retype, Enter) to watch the " +
                    "*selected* case's `payment` re-run (debounced ~300 ms) — switch cases with the " +
                    "header's ‹ › and the one you leave goes stale (italic) until you navigate back to it, " +
                    'at which point it re-runs immediately. "Invalid input" carries an unparseable ' +
                    "`loanAmount` cell — navigate to it to see the run-level failure: the header's error " +
                    'icon and every result cell blank, never a per-row error.',
            },
        },
    },
    loaders: [async () => buildServiceWithMutable(LOAN_ORIGINATION_MODEL)],
    render: (_args, {loaded}) => (
        <TestCasesAndTestRunnerHarness service={loaded.service} mutable={loaded.mutable} path="*" />
    ),
};

// --- Full model: every row kind, with a DocumentationService overlay ---

const FULL_MODEL = `{
  type Applicant: {
    name: <string, required: true>
    surname: <string, required: true>
  }
  application: {
    applicationDate: <date, required: true>
    applicants: <Applicant[], required: true>
    propertyValue: <number, required: true>
  }
  reviewStages: ["Application", "Underwriting", "Credit review", "Closing"]
  offices: [
    { id: 1, address: { city: "Vilnius", zip: "01001" } }
    { id: 2, address: { city: "Kaunas", zip: "44001" } }
  ]
  func monthly(amount: number): amount / 12
  func compute(x: number): { doubled: x * 2; total: doubled + 1 }
  func answer(): 42
  group: {
    func nested(x: number): x + 1
  }
  ruleset risk(age: number, income: number): {
    hitPolicy: "first-match"
    rules: [
      { when: { age: 18..25, income: < 30000 }, then: { level: "high", limit: 1000 } }
      { when: age >= 26 and age <= 64, then: { level: "medium", limit: 5000 } }
    ]
    default: { level: "none", limit: 0 }
  }
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
  plan: factoryProduction(workers: 8, sticks: 40, plates: 12)
}`;

export const FullModel: Story = {
    parameters: {
        docs: {
            description: {
                story:
                    'Every `BoxedRowKind` in one model: a reusable `complexType`, a `list`, a `relation`, ' +
                    'inline/multi-statement/no-argument/nested `func`s, a full `ruleset`, and a full ' +
                    '`optimise` — plus a `DocumentationService` overlay with three rows pre-seeded. Hover ' +
                    'the Description column, or hold **Alt** to reveal every type at once.',
            },
        },
    },
    loaders: [
        async () => {
            const fixture = await buildExecutingService(FULL_MODEL, true);
            const documentationService = createDocumentationService(uniqueDbName('full-model-docs'));
            documentationService.setDescription('application', 'Current loan application');
            documentationService.setDescription('reviewStages', 'Ordered application workflow');
            documentationService.setDescription('risk', 'Credit risk tiering');
            return {...fixture, documentationService};
        },
    ],
    render: (_args, {loaded}) => (
        <ExecutingHarness
            service={loaded.service}
            mutable={loaded.mutable}
            documentationService={loaded.documentationService}
        />
    ),
};

// --- ruleset-bearing model: inline rule CRUD ---

const RULESET_MODEL = `{
  ruleset risk(age: number, income: number): {
    hitPolicy: "first-match"
    rules: [
      { when: { age: 18..25, income: < 30000 }, then: { level: "high", limit: 1000 } }
      { when: age >= 26 and age <= 64, then: { level: "medium", limit: 5000 } }
    ]
    default: { level: "none", limit: 0 }
  }
}`;

const DECISION_TABLE_CRUD_MODEL = `{
  ruleset risk(age: number, segment: string, applied: date): {
    hitPolicy: "first-match"
    rules: [
      { when: { age: 18..25, segment: "retail", applied: >= @"2024-01-01" }, then: { level: "high" } }
      { when: age >= 26 and segment = "retail", then: { level: "medium" } }
    ]
    default: { level: "none" }
  }
  ruleset ranked(score: number): {
    hitPolicy: "best-match"
    rules: [
      { priority: 10, when: { score: >= 700 }, then: { level: "low" } }
      { priority: 1, when: { score: < 700 }, then: { level: "high" } }
    ]
    default: { level: "none" }
  }
  riskResult: risk(age: 30, segment: "retail", applied: @"2025-01-01")
  rankedResult: ranked(score: 720)
}`;

export const DecisionTableCrudPlayground: Story = {
    loaders: [async () => buildExecutingService(DECISION_TABLE_CRUD_MODEL)],
    render: (_args, {loaded}) => <ExecutingHarness service={loaded.service} mutable={loaded.mutable} />,
};

const SETTINGS_RULESET_MODEL = `{
  ruleset collectable(x: number): {
    hitPolicy: "first-match"
    rules: [
      { when: { x: >= 0 }, then: { value: 1 } }
      { when: { x: <= 10 }, then: { value: 2 } }
    ]
    default: { value: 0 }
  }
  result: collectable(x: 5)
}`;

export const SettingsRuleFormsPlayground: Story = {
    loaders: [async () => buildExecutingService(SETTINGS_RULESET_MODEL)],
    render: (_args, {loaded}) => <ExecutingHarness service={loaded.service} mutable={loaded.mutable} />,
};

export const RulesetCrud: Story = {
    parameters: {
        docs: {
            description: {
                story:
                    'A `ruleset` with both rule-condition forms — a cell-map rule (`age`/`income`) and a ' +
                    'boolean-expression rule — plus `ruleset-hit-policy` and the pinned `ruleset-default` ' +
                    "row. Use a rule's three-dots menu to add/duplicate/remove rows and columns.",
            },
        },
    },
    loaders: [async () => ({service: await buildService(RULESET_MODEL)})],
    render: (args, {loaded}) => (
        <BoxedEditor {...args} service={loaded.service} path="*" languageService={MutableDecisionService} />
    ),
};

// --- optimisation-bearing model: inline variable/objective/constraint CRUD ---

const OPTIMISE_MODEL = `{
  optimise factory(workers: number, sticks: number, plates: number): {
    using: "highs"
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
  plan: factory(workers: 8, sticks: 40, plates: 12)
}`;

export const OptimisationCrud: Story = {
    parameters: {
        docs: {
            description: {
                story:
                    'An `optimise` block: `optimisation-setting` rows (`using`/`bottlenecks`/`timeLimit`), ' +
                    'an `optimisation-variable-group`, the objective, and an `optimisation-constraint-group`. ' +
                    'Use each group\'s three-dots menu for "Add Variable" / "Add Constraint" — a variable ' +
                    'the objective/constraints never reference is rejected by the engine on commit (E339).',
            },
        },
    },
    loaders: [async () => buildExecutingService(OPTIMISE_MODEL, true)],
    render: (_args, {loaded}) => <ExecutingHarness service={loaded.service} mutable={loaded.mutable} />,
};

const OPTIMISE_SETTINGS_MODEL = `{
  optimise factory(workers: number): {
    using: "highs"
    variables: { chairs: <number, integer: true, min: 0> }
    maximise: chairs
    constraints: { capacity: chairs <= workers }
  }
  plan: factory(workers: 8)
}`;

export const OptimisationSettingsPlayground: Story = {
    loaders: [async () => buildExecutingService(OPTIMISE_SETTINGS_MODEL, true)],
    render: (_args, {loaded}) => <ExecutingHarness service={loaded.service} mutable={loaded.mutable} />,
};

// --- func-bearing model: inline, multi-statement, no-argument, nested ---

const FUNCTION_MODEL = `{
  func monthly(amount: number): amount / 12
  func compute(x: number): { doubled: x * 2; total: doubled + 1 }
  func answer(): 42
  group: {
    func nested(x: number): x + 1
  }
}`;

const FUNCTION_CRUD_MODEL = `{
  principal: 1200
  months: 12
  func payment(amount: number, term: number): amount / term
  group: { func nested(x: number): x + 1 }
  result: payment(amount: principal, term: months)
}`;

export const FunctionCrudPlayground: Story = {
    loaders: [async () => buildExecutingService(FUNCTION_CRUD_MODEL)],
    render: (_args, {loaded}) => <ExecutingHarness service={loaded.service} mutable={loaded.mutable} />,
};

const FUNCTION_SCOPE_MODEL = `{
  base: 10
  func sibling(x: number, baseValue: number): x + baseValue
  siblingResult: sibling(x: 5, baseValue: base)
  group: {
    offset: 2
    func nested(x: number, offsetValue: number): x + offsetValue
    result: nested(x: 3, offsetValue: offset)
  }
}`;

export const FunctionScopePlayground: Story = {
    loaders: [async () => buildExecutingService(FUNCTION_SCOPE_MODEL)],
    render: (_args, {loaded}) => <ExecutingHarness service={loaded.service} mutable={loaded.mutable} />,
};

const RELATION_CRUD_MODEL = `{
  properties: [
    { reference: "P-001", value: 320000, address: { city: "Vilnius", zip: "01001" } }
    { reference: "P-002", value: 180000, address: { city: "Kaunas", zip: "44001" } }
    { reference: "P-003", value: 240000, address: { city: "Klaipėda", zip: "92001" } }
  ]
}`;

export const RelationCrudPlayground: Story = {
    loaders: [
        async () => {
            const fixture = await buildExecutingService(RELATION_CRUD_MODEL);
            const documentationService = createDocumentationService(uniqueDbName('relation-crud-docs'));
            documentationService.setDescription('properties', 'Collateral properties');
            return {...fixture, documentationService};
        },
    ],
    render: (_args, {loaded}) => (
        <ExecutingHarness
            service={loaded.service}
            mutable={loaded.mutable}
            documentationService={loaded.documentationService}
        />
    ),
};

function RenameOverlayHarness({
    service,
    documentationService,
    testCasesService,
    testCaseId,
}: {
    service: BoxedEditorService;
    documentationService: ReturnType<typeof createDocumentationService>;
    testCasesService: ReturnType<typeof createTestCasesService>;
    testCaseId: string;
}): ReactElement {
    const [revision, setRevision] = useState(0);
    const paths = ['source', 'renamed', 'source.value', 'renamed.value', 'target.value'];
    return (
        <Box>
            <BoxedEditor
                service={service}
                path="*"
                languageService={MutableDecisionService}
                documentationService={documentationService}
                testCasesService={testCasesService}
                testSubjectId="*"
                onChange={() => setRevision((value) => value + 1)}
            />
            <Typography data-testid="overlay-descriptions">
                {paths.map((path) => `${path}:${documentationService.getDescription(path) ?? ''}`).join('|')}
            </Typography>
            <Typography data-testid="overlay-test-cell">
                {paths
                    .map((path) => `${path}:${testCasesService.getCell(testCaseId, path, 'input') ?? ''}`)
                    .join('|')}
            </Typography>
            <Typography data-testid="live-model">{JSON.stringify(service.toPortable())}</Typography>
            <span hidden>{revision}</span>
        </Box>
    );
}

export const RenameOverlayPlayground: Story = {
    loaders: [
        async () => {
            const service = await buildService(
                '{ source: { value: 1; doubled: value * 2 }; sourceValue: source.value; target: { existing: 2 }; free: 3 }',
            );
            const documentationService = createDocumentationService(uniqueDbName('rename-docs'));
            documentationService.setDescription('source', 'Source context');
            documentationService.setDescription('source.value', 'Nested value');
            const testCasesService = createTestCasesService(uniqueDbName('rename-cases'), '*');
            testCasesService.syncRows([{path: 'source.value', section: 'inputs', order: 0, present: true}]);
            const testCase = testCasesService.addTestCase('Case 1');
            testCasesService.setCell(testCase.id, 'source.value', 'input', '42');
            return {service, documentationService, testCasesService, testCaseId: testCase.id};
        },
    ],
    render: (_args, {loaded}) => (
        <RenameOverlayHarness
            service={loaded.service as BoxedEditorService}
            documentationService={
                loaded.documentationService as ReturnType<typeof createDocumentationService>
            }
            testCasesService={loaded.testCasesService as ReturnType<typeof createTestCasesService>}
            testCaseId={loaded.testCaseId as string}
        />
    ),
};

export const FunctionBodies: Story = {
    parameters: {
        docs: {
            description: {
                story:
                    'Four `func` shapes: `monthly` (single inline expression — a synthesized, non-draggable ' +
                    '`result` row), `compute` (multi-statement body — ordinary field rows, never a ' +
                    'synthesized result), `answer` (no arguments), and `group.nested` (a function nested ' +
                    'inside a context).',
            },
        },
    },
    loaders: [async () => ({service: await buildService(FUNCTION_MODEL)})],
    render: (args, {loaded}) => (
        <BoxedEditor {...args} service={loaded.service} path="*" languageService={MutableDecisionService} />
    ),
};
