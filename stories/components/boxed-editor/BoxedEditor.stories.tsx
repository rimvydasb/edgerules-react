import type { Meta, StoryObj } from '@storybook/react-vite';
import { init, MutableDecisionService } from '@edgerules/web/mutable';
import {
  BoxedEditor,
  createBoxedEditorService,
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

// Phase 1 implements `model`/`field`/`context`/`complexType`; the rest of the vocabulary
// (list/relation/function/ruleset/optimisation) renders as a labelled placeholder until
// Phases 3–4 land — this model exercises both paths side by side.
const PREVIEW_OF_LATER_PHASES_MODEL = `{
  application: { amount: <number, required: true> }
  stages: ["review", "approve"]
  func monthly(amount: number): amount / 12
  ruleset risk(age: number): {
    hitPolicy: "first-match"
    rules: [{ when: { age: >= 18 }, then: { eligible: true } }]
  }
}`;

const LARGE_MODEL = `{ ${Array.from({ length: 200 }, (_, index) => `value${index}: ${index}`).join(' ')} }`;

async function buildService(code: string) {
  await init();
  return createBoxedEditorService(MutableDecisionService.fromCode(code));
}

const meta: Meta<typeof BoxedEditor> = {
  title: 'Boxed Editor/BoxedEditor',
  component: BoxedEditor,
  parameters: {
    docs: {
      description: {
        component:
          'Phase 1: grid chrome, contexts, and the simple row kinds (`model`, `field`, ' +
          '`context`, `complexType`). Mutation, the expression cell, and the remaining row ' +
          'kinds land in later phases — unimplemented kinds render a labelled placeholder.',
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
    <BoxedEditor {...args} service={loaded.service} path="*" />
  ),
};

export const FocusedContext: Story = {
  loaders: [
    async () => ({ service: await buildService(LOAN_ORIGINATION_MODEL) }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="application" />
  ),
};

export const ReadOnly: Story = {
  loaders: [
    async () => ({ service: await buildService(LOAN_ORIGINATION_MODEL) }),
  ],
  render: (args, { loaded }) => (
    <BoxedEditor {...args} service={loaded.service} path="*" readOnly />
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
    <BoxedEditor {...args} service={loaded.service} path="*" />
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
