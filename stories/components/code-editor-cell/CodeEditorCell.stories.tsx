import { useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { init, MutableDecisionService } from '@edgerules/web/mutable';
import { CodeEditorCell } from '../../../src/components/code-editor-cell';
import {
  CELL_EMBED_PREFIX,
  CELL_EMBED_SUFFIX,
} from '../../../src/components/code-editor/testing/model.dsl';

async function buildService() {
  await init();
  return MutableDecisionService;
}

const embedContext = { prefix: CELL_EMBED_PREFIX, suffix: CELL_EMBED_SUFFIX };

function CellHarness({
  service,
  initialValue,
  multiline = false,
}: {
  service: typeof MutableDecisionService;
  initialValue: string;
  multiline?: boolean;
}): ReactElement {
  const [value, setValue] = useState(initialValue);
  const [committed, setCommitted] = useState<string | null>(null);
  return (
    <Box sx={{ maxWidth: 420 }}>
      <CodeEditorCell
        value={value}
        onChange={setValue}
        onCommit={setCommitted}
        onCancel={() => setCommitted(null)}
        service={service}
        embedContext={embedContext}
        multiline={multiline}
        placeholder="expression…"
      />
      <Typography variant="caption" data-testid="committed">
        committed: {committed ?? '—'}
      </Typography>
    </Box>
  );
}

const meta: Meta<typeof CodeEditorCell> = {
  title: 'Code Editor/CodeEditorCell',
  component: CodeEditorCell,
  parameters: {
    docs: {
      description: {
        component:
          'Compact EdgeRules cell editor for Boxed / Decision Table editors: full language ' +
          'tooling in a one-line control. Enter commits, Escape cancels, the embed context ' +
          'gives the cell the scope of its surrounding model.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof CodeEditorCell>;

export const Default: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (_args, { loaded }) => (
    <CellHarness
      service={loaded.service as typeof MutableDecisionService}
      initialValue="applicant.age + 1"
    />
  ),
};

export const WithLintError: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (_args, { loaded }) => (
    <CellHarness
      service={loaded.service as typeof MutableDecisionService}
      initialValue="bogusReference"
    />
  ),
};

export const Multiline: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (_args, { loaded }) => (
    <CellHarness
      service={loaded.service as typeof MutableDecisionService}
      initialValue={'if applicant.age >= 18\nthen "adult"\nelse "minor"'}
      multiline
    />
  ),
};
