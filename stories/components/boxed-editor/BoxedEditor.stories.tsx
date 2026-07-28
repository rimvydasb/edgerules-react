import {useEffect, useMemo, useState, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
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
    loaders: [async () => ({service: await buildService(COLLECTIONS_MODEL)})],
    render: (args, {loaded}) => (
        <BoxedEditor {...args} service={loaded.service} path="*" languageService={MutableDecisionService} />
    ),
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
            const service = await buildService(FULL_MODEL);
            const documentationService = createDocumentationService(uniqueDbName('full-model-docs'));
            documentationService.setDescription('application', 'Current loan application');
            documentationService.setDescription('reviewStages', 'Ordered application workflow');
            documentationService.setDescription('risk', 'Credit risk tiering');
            return {service, documentationService};
        },
    ],
    render: (_args, {loaded}) => (
        <BoxedEditor
            service={loaded.service}
            path="*"
            languageService={MutableDecisionService}
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
    loaders: [async () => ({service: await buildService(OPTIMISE_MODEL)})],
    render: (args, {loaded}) => (
        <BoxedEditor {...args} service={loaded.service} path="*" languageService={MutableDecisionService} />
    ),
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
