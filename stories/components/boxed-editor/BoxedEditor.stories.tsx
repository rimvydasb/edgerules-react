import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { init, MutableDecisionService } from '@edgerules/web/mutable';
import { BoxedEditor } from '../../../src/components/boxed-editor';

const MODEL = `{
  type Applicant: {
    age: <number>;
    income: <number>
  }
  application: {
    amount: <number, required: true>
    applicant: <Applicant>
    calculation: amount * 0.2
  }
  func monthly(amount: number) -> number: amount / 12
  external func lookup(id: string) -> string
  payment: monthly(application.amount)
}`;

async function buildService(model = MODEL) { await init(); return MutableDecisionService.fromCode(model); }

const meta: Meta<typeof BoxedEditor> = { title: 'Boxed Editor/BoxedEditor', component: BoxedEditor };
export default meta;
type Story = StoryObj<typeof BoxedEditor>;

export const RootReadOnly: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (args, { loaded }) => <BoxedEditor {...args} service={loaded.service} path="*" readOnly />,
};

export const FocusedFunction: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (args, { loaded }) => <BoxedEditor {...args} service={loaded.service} path="monthly" readOnly />,
};

export const Editable: Story = {
  loaders: [async () => ({ service: await buildService() })],
  render: (args, { loaded }) => {
    const [changes, setChanges] = useState(0);
    return <>
      <BoxedEditor {...args} service={loaded.service} path="*" languageService={MutableDecisionService} onChange={() => setChanges(value => value + 1)} />
      <output data-testid="boxed-change-count">Changes: {changes}</output>
    </>;
  },
};

export const InlineFunction: Story = {
  loaders: [async () => ({ service: await buildService(`{
    func monthly(amount: number) -> number: amount / 12
  }`) })],
  render: (args, { loaded }) => <BoxedEditor {...args} service={loaded.service} path="monthly" />,
};

export const ContextFunction: Story = {
  loaders: [async () => ({ service: await buildService(`{
    func summary(amount: number): {
      tax: amount * 0.2
      result: amount + tax
    }
  }`) })],
  render: (args, { loaded }) => <BoxedEditor {...args} service={loaded.service} path="summary" />,
};

export const ExternalFunction: Story = {
  loaders: [async () => ({ service: await buildService(`{
    external func lookup(id: string) -> number
  }`) })],
  render: (args, { loaded }) => <BoxedEditor {...args} service={loaded.service} path="lookup" />,
};

export const Invocation: Story = {
  loaders: [async () => ({ service: await buildService(`{
    func monthly(amount: number) -> number: amount / 12
    payment: monthly(1200)
  }`) })],
  render: (args, { loaded }) => <BoxedEditor {...args} service={loaded.service} path="payment" />,
};

export const LiteralList: Story = {
  loaders: [async () => ({ service: await buildService(`{
    scores: [12, 19, 27, 35]
  }`) })],
  render: (args, { loaded }) => <BoxedEditor {...args} service={loaded.service} path="scores" />,
};

export const Relation: Story = {
  loaders: [async () => ({ service: await buildService(`{
    applicants: [
      { name: "Ada"; age: 36 }
      { name: "Grace"; age: 42 }
    ]
  }`) })],
  render: (args, { loaded }) => <BoxedEditor {...args} service={loaded.service} path="applicants" />,
};
