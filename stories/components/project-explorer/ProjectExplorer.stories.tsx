import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { init, MutableDecisionService } from '@edgerules/web/mutable';
import { ProjectExplorer } from '../../../src/components/project-explorer';
import { MODEL_DSL } from '../../../src/components/project-explorer/testing/model.dsl';

// Real `@edgerules/web` in an actual browser (Storybook), not a mock — see the plan's "WASM
// loading" note for why Vitest/Node uses `@edgerules/node` instead for the same reason.
async function buildService(code: string) {
  await init();
  return MutableDecisionService.fromCode(code);
}

const meta: Meta<typeof ProjectExplorer> = {
  title: 'Project Explorer/ProjectExplorer',
  component: ProjectExplorer,
};

export default meta;

type Story = StoryObj<typeof ProjectExplorer>;

export const Default: Story = {
  loaders: [async () => ({ service: await buildService(MODEL_DSL) })],
  render: (args, { loaded }) => (
    <ProjectExplorer {...args} service={loaded.service} />
  ),
};

export const Expanded: Story = {
  loaders: [async () => ({ service: await buildService(MODEL_DSL) })],
  render: (args, { loaded }) => (
    <ProjectExplorer {...args} service={loaded.service} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Types'));
    await userEvent.click(await canvas.findByText('Variables'));
  },
};

export const WithLinkingError: Story = {
  // `risk` (a `firstMatch` decision table) currently renders as a plain [ctx], not [dt] — the
  // real engine does not yet project `@kind: 'invocation'` on read (known gap, see the plan and
  // tree-model.test.ts). This story instead demonstrates the error-badge/tooltip path: a real
  // CRUD `remove()` call leaves a dangling reference, and `box`'s next `get()` surfaces it.
  //
  // The `remove()` call happens in `play` (after the story has already mounted successfully),
  // not in the loader — breaking the reference before mount would fail the *root* fetch instead,
  // showing the top-level error state rather than a single node's badge/tooltip.
  loaders: [
    async () => ({ service: await buildService('{ box: { a: 1 b: a + 1 } }') }),
  ],
  render: (args, { loaded }) => (
    <ProjectExplorer {...args} service={loaded.service} />
  ),
  play: async ({ canvasElement, loaded }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('box');
    loaded.service.remove('box.a');
    await userEvent.click(canvas.getByText('box'));
  },
};
