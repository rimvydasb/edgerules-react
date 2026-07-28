import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { init, MutableDecisionService } from '@edgerules/web/mutable';
import {
  BoxedEditor,
  createBoxedEditorService,
  type BoxedEditorService,
} from '../../../src/components/boxed-editor';
import { createDocumentationService } from '../../../src/components/documentation-service';
import { createTestCasesService } from '../../../src/components/test-cases-service';
import {
  createTestRunner,
  type MutableDecisionService as RunnerService,
  type TestSubject,
} from '../../../src/components/tests-manager';

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
  payment: 2666.67
}`;

// Phases 1–3 implement `model`/`field`/`context`/`complexType`/`list`/`list-item`/`relation`/
// `relation-item`; `function`/`ruleset`/`optimisation` still render as a labelled placeholder
// until Phase 4 lands — this model exercises both paths side by side.
const PREVIEW_OF_LATER_PHASES_MODEL = `{
  application: { amount: <number, required: true> }
  stages: ["review", "approve"]
  func monthly(amount: number): amount / 12
  ruleset risk(age: number): {
    hitPolicy: "first-match"
    rules: [{ when: { age: >= 18 }, then: { eligible: true } }]
  }
}`;

// A scalar `list`, a homogeneous `relation`, a *heterogeneous* relation (a record missing a
// field renders an empty cell, never a nested field row), and a relation whose cell holds a
// complex object (a drill-down, rendered as nested rows rather than JSON text).
const COLLECTIONS_MODEL = `{
  reviewStages: ["Application", "Underwriting", "Credit review", "Closing"]
  applicants: [
    { reference: "LOAN-001", applicant: "Ada L.", amount: 320000 }
    { reference: "LOAN-002", applicant: "Grace H." }
  ]
  offices: [
    { id: 1, address: { city: "Vilnius", zip: "01001" } }
    { id: 2, address: { city: "Kaunas", zip: "44001" } }
  ]
}`;

const LARGE_MODEL = `{ ${Array.from({ length: 200 }, (_, index) => `value${index}: ${index}`).join(' ')} }`;

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
  const [, setVersion] = useState(0);
  const payment = service.getBoxedRowData('payment')?.value ?? '(not in this model)';

  return (
    <Box sx={{ width: 'fit-content' }}>
      <BoxedEditor
        service={service}
        path={path}
        languageService={MutableDecisionService}
        readOnly={readOnly}
        onChange={() => setVersion((current) => current + 1)}
      />
      <Typography
        variant="caption"
        data-testid="live-payment"
        sx={{ display: 'block', mt: 1 }}
      >
        payment (committed): {payment}
      </Typography>
    </Box>
  );
}

async function buildServiceWithMutable(code: string) {
  await init();
  const mutable = MutableDecisionService.fromCode(code);
  return { service: createBoxedEditorService(mutable), mutable };
}

const MODEL_SUBJECT: TestSubject = { id: '*', kind: 'model', name: 'Model' };

/**
 * Phase 7: wires a `DocumentationService` and a `TestCasesService` + `TestRunner` exactly as a
 * host would — `testRunner` memoized on `[mutable, testCasesService, revision]` and `revision`
 * bumped from `onChange`, so an edit re-runs the selected case (debounced) and `TestResultCell`
 * shows the live value.
 */
function TestResultsHarness({
  service,
  mutable,
  path,
}: {
  service: BoxedEditorService;
  mutable: InstanceType<typeof MutableDecisionService>;
  path: string;
}): ReactElement {
  const [revision, setRevision] = useState(0);
  const documentationService = useMemo(
    () => createDocumentationService('boxed-editor-story'),
    [],
  );
  const testCasesService = useMemo(
    () => createTestCasesService('boxed-editor-story', '*'),
    [],
  );
  const testRunner = useMemo(
    () =>
      createTestRunner(mutable as unknown as RunnerService, testCasesService, MODEL_SUBJECT, {
        modelRevision: String(revision),
      }),
    [mutable, testCasesService, revision],
  );

  // Seeds one test case the first time this story mounts against a fresh IndexedDB database.
  useEffect(() => {
    if (testCasesService.listTestCases().length > 0) return;
    testCasesService.syncRows([
      { path: 'application.loanAmount', section: 'inputs', order: 0, type: 'number', present: true },
      { path: 'application.propertyValue', section: 'inputs', order: 1, type: 'number', present: true },
      {
        path: 'application.applicationDate',
        section: 'inputs',
        order: 2,
        type: 'date',
        present: true,
      },
    ]);
    const testCase = testCasesService.addTestCase('Standard application');
    testCasesService.setCell(testCase.id, 'application.loanAmount', 'input', '250000');
    testCasesService.setCell(testCase.id, 'application.propertyValue', 'input', '320000');
    testCasesService.setCell(testCase.id, 'application.applicationDate', 'input', '"2024-01-01"');
  }, [testCasesService]);

  return (
    <BoxedEditor
      service={service}
      path={path}
      languageService={MutableDecisionService}
      documentationService={documentationService}
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
          'Phase 2 adds the expression cell: click a `field` row’s value to swap in a ' +
          'model-scoped CodeMirror editor (Enter/blur commits, Escape reverts); a rejected ' +
          'edit keeps the cell active and shows the engine’s message inline. `onChange` ' +
          'fires once per successful commit. Phase 3 adds `list`/`relation` rows and the ' +
          'trailing "(new …)" placeholder every appendable container renders — click it to ' +
          'append without opening a menu. The remaining row kinds still render a labelled ' +
          'placeholder until Phase 4 lands.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof BoxedEditor>;

export const RootModel: Story = {
  loaders: [
    async () => ({ service: await buildService(LOAN_ORIGINATION_MODEL) }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="*" languageService={MutableDecisionService} />
  ),
};

export const EditableExpression: Story = {
  loaders: [
    async () => ({ service: await buildService(LOAN_ORIGINATION_MODEL) }),
  ],
  render: (_args, { loaded }) => <EditableHarness service={loaded.service} path="*" />,
};

export const FocusedContext: Story = {
  loaders: [
    async () => ({ service: await buildService(LOAN_ORIGINATION_MODEL) }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor
      {...args}
      service={loaded.service}
      path="application"
      languageService={MutableDecisionService}
    />
  ),
};

export const ReadOnly: Story = {
  loaders: [
    async () => ({ service: await buildService(LOAN_ORIGINATION_MODEL) }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor
      {...args}
      service={loaded.service}
      path="*"
      languageService={MutableDecisionService}
      readOnly
    />
  ),
};

export const ColumnsHidden: Story = {
  loaders: [
    async () => ({ service: await buildService(LOAN_ORIGINATION_MODEL) }),
  ],
  render: (args, { loaded }) => (
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

export const PreviewOfLaterPhases: Story = {
  loaders: [
    async () => ({ service: await buildService(PREVIEW_OF_LATER_PHASES_MODEL) }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor
      {...args}
      service={loaded.service}
      path="*"
      languageService={MutableDecisionService}
    />
  ),
};

export const CollectionsListAndRelation: Story = {
  loaders: [async () => ({ service: await buildService(COLLECTIONS_MODEL) })],
  render: (args, { loaded }) => (
    <BoxedEditor
      {...args}
      service={loaded.service}
      path="*"
      languageService={MutableDecisionService}
    />
  ),
};

export const FatalError: Story = {
  loaders: [
    async () => ({ service: await buildService(LOAN_ORIGINATION_MODEL) }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="does.not.exist" />
  ),
};

export const LargeModel: Story = {
  loaders: [async () => ({ service: await buildService(LARGE_MODEL) })],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="*" readOnly />
  ),
};

export const DescriptionsAndLiveTestResults: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Phase 7: free-text descriptions persist through a `DocumentationService`; the Test ' +
          'Results column shows the seeded "Standard application" case, re-running (debounced ' +
          '~300 ms) whenever a field is edited — try editing `application.loanAmount` and watch ' +
          'its own test-results cell pick up the new value once the run lands.',
      },
    },
  },
  loaders: [async () => buildServiceWithMutable(LOAN_ORIGINATION_MODEL)],
  render: (_args, { loaded }) => (
    <TestResultsHarness service={loaded.service} mutable={loaded.mutable} path="*" />
  ),
};
