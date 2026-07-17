import { useMemo, useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { init, MutableDecisionService } from '@edgerules/web/mutable';
import { DecisionTableEditor } from '../../../src/components/decision-table';
import {
  BEST_MATCH_MODEL_DSL,
  RISK_MODEL_DSL,
  SCORECARD_MODEL_DSL,
} from '../../../src/components/decision-table/testing/model.dsl';

async function buildService(code: string) {
  await init();
  return MutableDecisionService.fromCode(code);
}

function EditorHarness({
  service,
  path,
  resultPath,
  readOnly = false,
}: {
  service: MutableDecisionService;
  path: string;
  resultPath: string;
  readOnly?: boolean;
}): ReactElement {
  const [version, setVersion] = useState(0);
  const result = useMemo(() => {
    try {
      return JSON.stringify(service.execute(resultPath));
    } catch (error) {
      return String((error as { message?: string }).message ?? error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, resultPath, version]);

  return (
    <Box sx={{ maxWidth: 980 }}>
      <DecisionTableEditor
        service={service}
        path={path}
        languageService={MutableDecisionService}
        readOnly={readOnly}
        onChange={() => setVersion((current) => current + 1)}
      />
      <Typography
        variant="caption"
        data-testid="live-result"
        sx={{ display: 'block', mt: 1 }}
      >
        {resultPath}: {result}
      </Typography>
    </Box>
  );
}

const meta: Meta<typeof DecisionTableEditor> = {
  title: 'Decision Table/DecisionTableEditor',
  component: DecisionTableEditor,
  parameters: {
    docs: {
      description: {
        component:
          'DMN-style decision table editor over an EdgeRules first-class `ruleset`: input ' +
          'columns from the parameters, output columns from the `then` shape, hit-policy ' +
          'selection, a pinned default row, boolean-expression rows, and scorecard support. ' +
          'Display cells are statically highlighted; the full CodeEditorCell mounts only on ' +
          'the cell being edited.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof DecisionTableEditor>;

export const DecisionTable: Story = {
  loaders: [async () => ({ service: await buildService(RISK_MODEL_DSL) })],
  render: (_args, { loaded }) => (
    <EditorHarness
      service={loaded.service as MutableDecisionService}
      path="risk"
      resultPath="decision"
    />
  ),
};

export const Scorecard: Story = {
  loaders: [async () => ({ service: await buildService(SCORECARD_MODEL_DSL) })],
  render: (_args, { loaded }) => (
    <EditorHarness
      service={loaded.service as MutableDecisionService}
      path="scoreFactors"
      resultPath="total"
    />
  ),
};

export const BestMatchPriorities: Story = {
  loaders: [
    async () => ({ service: await buildService(BEST_MATCH_MODEL_DSL) }),
  ],
  render: (_args, { loaded }) => (
    <EditorHarness
      service={loaded.service as MutableDecisionService}
      path="tier"
      resultPath="result"
    />
  ),
};

export const ReadOnly: Story = {
  loaders: [async () => ({ service: await buildService(RISK_MODEL_DSL) })],
  render: (_args, { loaded }) => (
    <EditorHarness
      service={loaded.service as MutableDecisionService}
      path="risk"
      resultPath="decision"
      readOnly
    />
  ),
};
