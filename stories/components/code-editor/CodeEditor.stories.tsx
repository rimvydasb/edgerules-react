import { useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { init, MutableDecisionService } from '@edgerules/web/mutable';
import { CodeEditor } from '../../../src/components/code-editor';
import { INVALID_MODEL_DSL, VALID_MODEL_DSL } from '../../../src/components/code-editor/testing/model.dsl';

async function buildService() {
  await init();
  return MutableDecisionService;
}

function StatefulCodeEditor({
  service,
  initialValue,
}: {
  service: typeof MutableDecisionService;
  initialValue: string;
}): ReactElement {
  const [value, setValue] = useState(initialValue);
  return <CodeEditor value={value} onChange={setValue} service={service} />;
}

const meta: Meta<typeof CodeEditor> = {
  title: 'Code Editor/CodeEditor',
  component: CodeEditor,
};

export default meta;

type Story = StoryObj<typeof CodeEditor>;

export const Default: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (_args, { loaded }) => (
    <StatefulCodeEditor service={loaded.service as typeof MutableDecisionService} initialValue={VALID_MODEL_DSL} />
  ),
};

export const WithSyntaxError: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (_args, { loaded }) => (
    <StatefulCodeEditor
      service={loaded.service as typeof MutableDecisionService}
      initialValue={INVALID_MODEL_DSL}
    />
  ),
};
