import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { init, MutableDecisionService } from '@edgerules/web/mutable';
import { BoxedEditor } from '../../../src/components/boxed-editor';
import { DecisionTableEditor } from '../../../src/components/decision-table';
import { ProjectExplorer } from '../../../src/components/project-explorer';

const MODEL = `{
  type Applicant: {
    age: <number>;
    income: <number>
  }
  application: {
    amount: <number, required: true>
    applicant: <Applicant>
    calculation: amount * 0.2
    mutableValue: 1
  }
  func monthly(amount: number) -> number: amount / 12
  external func lookup(id: string) -> string
  payment: monthly(application.amount)
}`;

async function buildService(model = MODEL) {
  await init();
  return MutableDecisionService.fromCode(model);
}

const LOAN_ORIGINATION_MODEL = `{
  type Applicant: {
    name: <string, required: true>; age: <number, required: true>;
    income: <number, 0>; expense: <number, 0>
  }
  application: {
    applicationDate: <date, required: true>
    applicants: <Applicant[], required: true>
    propertyValue: <number, required: true>
    loanAmount: <number, required: true>
  }
  func creditScore(age: number, income: number) -> number: 300 + age * 2 + income / 1000
  func applicantDecision(applicant: Applicant): {
    netIncome: applicant.income - applicant.expense
    score: creditScore(applicant.age, applicant.income)
    eligible: score >= 700 and netIncome > 2000
    return: { score: score, eligible: eligible }
  }
  decisions: for applicant in application.applicants return applicantDecision(applicant)
  finalDecision: if count(decisions[eligible = false]) > 0 then "DECLINE" else "APPROVE"
}`;

const ROUTING_MODEL = `{
  type Applicant: { age: <number> }
  baseRate: 0.05
  application: { amount: <number, required: true> }
  func monthly(amount: number) -> number: amount / 12
  ruleset risk(age: number): {
    hitPolicy: "first-match"
    rules: [{ when: { age: 1..100 }, then: { eligible: true } }]
    default: { eligible: false }
  }
  loop counter(x: number): {
    state: { n: x }
    while: state.n > 0
    maxIterations: 10
    do: { n: state.n - 1 }
    return: state.n
  }
}`;

const NESTED_FUNCTION_MODEL = `{
  application: {
    amount: 1200
    func affordability(income: number): {
      monthlyIncome: income / 12
      threshold: monthlyIncome * 0.35
      return: threshold
    }
  }
}`;

const LARGE_MODEL = `{ ${Array.from({ length: 200 }, (_, index) => `value${index}: ${index}`).join(' ')} }`;

type WorkspaceRoute =
  | { kind: 'boxed'; path: string }
  | { kind: 'type-definition' | 'ruleset' | 'loop'; path: string };

/** A host-level integration example: Project Explorer uses an empty root path, while BoxedEditor uses "*". */
function IntegrationWorkspace({
  service,
}: {
  service: MutableDecisionService;
}) {
  const [route, setRoute] = useState<WorkspaceRoute>({
    kind: 'boxed',
    path: '*',
  });
  const [revision, setRevision] = useState(0);
  const openBoxed = (projectPath: string) =>
    setRoute({ kind: 'boxed', path: projectPath || '*' });

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '240px minmax(0, 1fr)',
        gap: 2,
      }}
    >
      <ProjectExplorer
        service={service}
        onOpenVariables={openBoxed}
        onOpenFunction={openBoxed}
        onOpenTypes={(name) =>
          setRoute({ kind: 'type-definition', path: name ?? '*' })
        }
        onOpenDecisionTable={(path) => setRoute({ kind: 'ruleset', path })}
      />
      <Box>
        <Typography
          data-testid="boxed-workspace-route"
          variant="caption"
          sx={{ display: 'block', mb: 1 }}
        >
          {route.kind}: {route.path}
        </Typography>
        {route.kind === 'boxed' ? (
          <BoxedEditor
            service={service}
            path={route.path}
            revision={revision}
            languageService={MutableDecisionService}
            onChange={() => setRevision((value) => value + 1)}
            onOpenNode={setRoute}
          />
        ) : route.kind === 'ruleset' ? (
          <DecisionTableEditor
            service={service}
            path={route.path}
            languageService={MutableDecisionService}
            onChange={() => setRevision((value) => value + 1)}
          />
        ) : (
          <Alert severity="info">
            {route.kind === 'type-definition' ? 'Types Editor' : 'Loop Editor'}{' '}
            route: {route.path}
          </Alert>
        )}
      </Box>
    </Box>
  );
}

const meta: Meta<typeof BoxedEditor> = {
  title: 'Boxed Editor/BoxedEditor',
  component: BoxedEditor,
};
export default meta;
type Story = StoryObj<typeof BoxedEditor>;

export const RootReadOnly: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="*" readOnly />
  ),
};

export const FocusedFunction: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="monthly" readOnly />
  ),
};

export const Editable: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (args, { loaded }) => {
    const [changes, setChanges] = useState(0);
    return (
      <>
        <BoxedEditor
          {...args}
          service={loaded.service}
          path="*"
          languageService={MutableDecisionService}
          onChange={() => setChanges((value) => value + 1)}
        />
        <output data-testid="boxed-change-count">Changes: {changes}</output>
      </>
    );
  },
};

export const InlineFunction: Story = {
  loaders: [
    async () => ({
      service: await buildService(`{
    func monthly(amount: number) -> number: amount / 12
  }`),
    }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="monthly" />
  ),
};

export const ContextFunction: Story = {
  loaders: [
    async () => ({
      service: await buildService(`{
    func summary(amount: number): {
      tax: amount * 0.2
      result: amount + tax
    }
  }`),
    }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="summary" />
  ),
};

export const ExternalFunction: Story = {
  loaders: [
    async () => ({
      service: await buildService(`{
    external func lookup(id: string) -> number
  }`),
    }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="lookup" />
  ),
};

export const Invocation: Story = {
  loaders: [
    async () => ({
      service: await buildService(`{
    func monthly(amount: number) -> number: amount / 12
    payment: monthly(1200)
  }`),
    }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="payment" />
  ),
};

export const LiteralList: Story = {
  loaders: [
    async () => ({
      service: await buildService(`{
    scores: [12, 19, 27, 35]
  }`),
    }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="scores" />
  ),
};

export const Relation: Story = {
  loaders: [
    async () => ({
      service: await buildService(`{
    applicants: [
      {
        name: "Ada"
        age: 36
        contact: {
          address: {
            location: {
              city: "London"
              country: "United Kingdom"
            }
          }
        }
      }
      {
        name: "Grace"
        age: 42
        contact: {
          address: {
            location: {
              city: "New York"
              country: "United States"
            }
          }
        }
      }
    ]
  }`),
    }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="applicants" />
  ),
};

export const DeepRelation: Story = {
  loaders: [
    async () => ({
      service: await buildService(`{
    organization: {
      division: {
        department: {
          applicants: [
            { name: "Ada"; age: 36 }
            { name: "Grace"; age: 42 }
          ]
        }
      }
    }
  }`),
    }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="*" />
  ),
};

export const LoanOriginationOverview: Story = {
  loaders: [
    async () => ({ service: await buildService(LOAN_ORIGINATION_MODEL) }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="*" readOnly />
  ),
};

export const ErrorState: Story = {
  loaders: [
    async () => {
      const service = await buildService('{ box: { a: 1 b: a + 1 } }');
      service.remove('box.a');
      return { service };
    },
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="*" />
  ),
};

export const ReadOnlyVisual: Story = {
  loaders: [
    async () => ({ service: await buildService(LOAN_ORIGINATION_MODEL) }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="*" readOnly />
  ),
};

export const NestedFunctionVisual: Story = {
  loaders: [
    async () => ({ service: await buildService(NESTED_FUNCTION_MODEL) }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="*" readOnly />
  ),
};

export const LargeModelVisual: Story = {
  loaders: [async () => ({ service: await buildService(LARGE_MODEL) })],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="*" readOnly />
  ),
};

export const ProjectExplorerIntegration: Story = {
  loaders: [async () => ({ service: await buildService(ROUTING_MODEL) })],
  render: (_args, { loaded }) => (
    <IntegrationWorkspace service={loaded.service} />
  ),
};
