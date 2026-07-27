import { useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { init, MutableDecisionService } from '@edgerules/web/mutable';
import {
  BoxedEditor,
  createBoxedEditorService,
  type BoxedEditorService,
} from '../../../src/components/boxed-editor';

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
