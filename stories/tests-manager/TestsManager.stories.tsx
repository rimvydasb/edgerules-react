import { useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { init, MutableDecisionService } from '@edgerules/web/mutable';
import { TestsManager } from '../../src/components/tests-manager';
import type { DocumentationService } from '../../src/components/tests-manager';

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

async function buildService(code: string): Promise<MutableDecisionService> {
  await init();
  return MutableDecisionService.fromCode(code);
}

function uniqueModelName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

// A minimal in-memory `DocumentationService` for stories: the real package
// (`edgerules-react/documentation-service`) doesn't ship yet, but this satisfies the same
// structural interface `TestsManager` accepts, so it demonstrates the Description column exactly
// as a host wiring the real service would see it.
function createMockDocumentationService(): DocumentationService {
  const store = new Map<string, string>();
  const listeners = new Set<() => void>();
  return {
    getDescription: (path) => store.get(path),
    setDescription: (path, description) => {
      if (description === '') store.delete(path);
      else store.set(path, description);
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const meta: Meta<typeof TestsManager> = {
  title: 'Tests Manager/TestsManager',
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

export const Workbook: Story = {
  loaders: [
    async () => {
      const service = await buildService(WORKBOOK_MODEL);
      return { service, modelName: uniqueModelName('workbook') };
    },
  ],
  render: (_args, { loaded }) => {
    const { service, modelName } = loaded as {
      service: MutableDecisionService;
      modelName: string;
    };
    return (
      <Box sx={{ maxWidth: 1100 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Type values into Inputs, then use a row&apos;s three-dots menu to
          &quot;Move to Assertions&quot; and edit the expected value to see the
          mismatch highlight.
        </Typography>
        <TestsManager service={service} modelName={modelName} />
      </Box>
    );
  },
};

export const DecisionServiceEntryPoints: Story = {
  loaders: [
    async () => {
      const service = await buildService(DECISION_SERVICE_MODEL);
      return { service, modelName: uniqueModelName('decision-service') };
    },
  ],
  render: (_args, { loaded }) => {
    const { service, modelName } = loaded as {
      service: MutableDecisionService;
      modelName: string;
    };
    return (
      <Box sx={{ maxWidth: 1100 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          The subject drop-down lists the model, a root <code>func</code>, a{' '}
          <code>ruleset</code>, a nested <code>library.eligibility</code>, and a{' '}
          <code>loop</code>. <code>untypedExample</code> is declared but has an
          untyped parameter, so it never appears as a subject.
        </Typography>
        <TestsManager
          service={service}
          modelName={modelName}
          subjectId="isEligible"
        />
      </Box>
    );
  },
};

export const OptimiseWithSolver: Story = {
  loaders: [
    async () => {
      const service = await buildService(OPTIMISE_MODEL);
      service.registerSolver(
        () => ({
          status: 'optimal',
          objective: 120,
          values: { chairs: 8, tables: 0 },
        }),
        { name: 'story-stub', version: '1.0' },
      );
      return { service, modelName: uniqueModelName('optimise-solved') };
    },
  ],
  render: (_args, { loaded }) => {
    const { service, modelName } = loaded as {
      service: MutableDecisionService;
      modelName: string;
    };
    return (
      <Box sx={{ maxWidth: 1100 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Solver registered by this story&apos;s own loader (EdgeRules ships
          none). Enter <code>workers</code>/<code>sticks</code>/
          <code>plates</code> to see the result record: status, objective, the
          decision variables, and <code>bottlenecks.*</code>.
        </Typography>
        <TestsManager
          service={service}
          modelName={modelName}
          subjectId="factoryProduction"
        />
      </Box>
    );
  },
};

export const OptimiseWithoutSolver: Story = {
  loaders: [
    async () => {
      const service = await buildService(OPTIMISE_MODEL);
      return { service, modelName: uniqueModelName('optimise-unsolved') };
    },
  ],
  render: (_args, { loaded }) => {
    const { service, modelName } = loaded as {
      service: MutableDecisionService;
      modelName: string;
    };
    return (
      <Box sx={{ maxWidth: 1100 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          No solver registered — the pre-flight banner appears instead of a
          per-cell failure.
        </Typography>
        <TestsManager
          service={service}
          modelName={modelName}
          subjectId="factoryProduction"
        />
      </Box>
    );
  },
};

export const ColumnPaging: Story = {
  loaders: [
    async () => {
      const service = await buildService(WORKBOOK_MODEL);
      return { service, modelName: uniqueModelName('paging') };
    },
  ],
  render: (_args, { loaded }) => {
    const { service, modelName } = loaded as {
      service: MutableDecisionService;
      modelName: string;
    };
    return (
      <Box sx={{ maxWidth: 1100 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          <code>pageSize=3</code>. Use &quot;Add test case&quot; a few times to
          see the Path and Description columns stay frozen while test-case
          columns page.
        </Typography>
        <TestsManager service={service} modelName={modelName} pageSize={3} />
      </Box>
    );
  },
};

export const SharedDocumentationService: Story = {
  loaders: [
    async () => {
      const service = await buildService(WORKBOOK_MODEL);
      return { service, modelName: uniqueModelName('shared-docs') };
    },
  ],
  render: (_args, { loaded }) => {
    const { service, modelName } = loaded as {
      service: MutableDecisionService;
      modelName: string;
    };
    const [documentationService] = useState(createMockDocumentationService);
    return (
      <Box sx={{ maxWidth: 1100 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Two <code>TestsManager</code> instances over the same model, sharing
          one <code>DocumentationService</code> instance — edit a Description
          cell in either and watch it appear in the other.
        </Typography>
        <Typography variant="subtitle2">Instance A</Typography>
        <TestsManager
          service={service}
          modelName={modelName}
          documentationService={documentationService}
        />
        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          Instance B
        </Typography>
        <TestsManager
          service={service}
          modelName={modelName}
          documentationService={documentationService}
        />
      </Box>
    );
  },
};

function LiveModelHarness({
  service,
  modelName,
}: {
  service: MutableDecisionService;
  modelName: string;
}): ReactElement {
  const [revision, setRevision] = useState(0);

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        &quot;Add bonus field&quot; edits the model directly through the engine
        and bumps <code>revision</code> — every case re-runs and the new field
        appears in Validations. &quot;Remove bonus field&quot; then hides its
        row again.
      </Typography>
      <Button
        size="small"
        sx={{ mr: 1, mb: 1 }}
        onClick={() => {
          service.set('bonus', { '@kind': 'expression', expression: '5' });
          setRevision((r) => r + 1);
        }}
      >
        Add bonus field
      </Button>
      <Button
        size="small"
        sx={{ mb: 1 }}
        onClick={() => {
          service.remove('bonus');
          setRevision((r) => r + 1);
        }}
      >
        Remove bonus field
      </Button>
      <TestsManager
        service={service}
        modelName={modelName}
        revision={revision}
      />
    </Box>
  );
}

export const LiveModelEdits: Story = {
  loaders: [
    async () => {
      const service = await buildService(WORKBOOK_MODEL);
      return { service, modelName: uniqueModelName('live-edits') };
    },
  ],
  render: (_args, { loaded }) => {
    const { service, modelName } = loaded as {
      service: MutableDecisionService;
      modelName: string;
    };
    return <LiveModelHarness service={service} modelName={modelName} />;
  },
};

export const IndexedArrayPaths: Story = {
  loaders: [
    async () => {
      const service = await buildService(ARRAY_MODEL);
      return { service, modelName: uniqueModelName('arrays') };
    },
  ],
  render: (_args, { loaded }) => {
    const { service, modelName } = loaded as {
      service: MutableDecisionService;
      modelName: string;
    };
    return (
      <Box sx={{ maxWidth: 1100 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Every array is pre-generated down to its element <code>[0]</code>, at
          any depth (<code>application.applicant[0].creditLine[0].balance</code>
          ). Use a row&apos;s three-dots menu to <strong>Duplicate</strong> it
          into the next element, and click a Path cell to retype it — an unknown
          path turns red as you type.
        </Typography>
        <TestsManager service={service} modelName={modelName} />
      </Box>
    );
  },
};

export const ReadOnly: Story = {
  loaders: [
    async () => {
      const service = await buildService(WORKBOOK_MODEL);
      return { service, modelName: uniqueModelName('read-only') };
    },
  ],
  render: (_args, { loaded }) => {
    const { service, modelName } = loaded as {
      service: MutableDecisionService;
      modelName: string;
    };
    return (
      <Box sx={{ maxWidth: 1100 }}>
        <TestsManager service={service} modelName={modelName} readOnly />
      </Box>
    );
  },
};
