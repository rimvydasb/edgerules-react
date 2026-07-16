import type { Meta, StoryObj } from '@storybook/react-vite';
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

async function buildService() { await init(); return MutableDecisionService.fromCode(MODEL); }

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
