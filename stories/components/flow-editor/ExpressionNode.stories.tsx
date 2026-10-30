import '@xyflow/react/dist/style.css';
import {useMemo, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, within} from 'storybook/test';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {createDocumentationService} from '../../../src/components/documentation-service';
import {createFlowEditorService, FlowEditor, type FlowLayout} from '../../../src/components/flow-editor';
import {SERVICE_MODEL} from '../../../src/components/flow-editor/testing/serviceModel';

// An input record, a literal rate and two computed values: each expression is a node, wired from what it reads.
const EXPRESSION_MODEL = `{
  func monthly(amount: number): amount / 12
  @InputNode(name: "Applicant")
  applicant: { income: 60000; address: { city: "Vilnius" } }
  rate: 0.2
  tax: applicant.income * rate
  net: applicant.income - tax
  city: applicant.address.city
  @FunctionNode(name: "Monthly")
  installment: monthly(amount: net)
}`;

const LAYOUT: FlowLayout = {
    positions: {},
    outputs: [{id: 'output', label: 'Monthly', source: {node: 'installment', handle: 'out:result'}}],
};

function Canvas({
    model = EXPRESSION_MODEL,
    root,
    readOnly = false,
}: {
    model?: string;
    root?: string;
    readOnly?: boolean;
}): ReactElement {
    const service = useMemo(
        () => createFlowEditorService(MutableDecisionService.fromCode(model) as never, {root}),
        [model, root],
    );
    const documentation = useMemo(() => createDocumentationService(`expression-story-${Math.random()}`), []);
    return (
        <div style={{width: '100%', height: 520}}>
            <FlowEditor
                service={service}
                documentation={documentation}
                languageService={MutableDecisionService}
                readOnly={readOnly}
                defaultLayout={root ? undefined : LAYOUT}
                defaultPaletteCollapsed
            />
        </div>
    );
}

const meta: Meta<typeof Canvas> = {
    title: 'Components/Flow Editor/Expression Node',
    component: Canvas,
    parameters: {layout: 'fullscreen'},
    loaders: [
        async () => {
            await init();
            return {};
        },
    ],
};
export default meta;

type Story = StoryObj<typeof Canvas>;

/** Every expression of the flow is a one-row node; its input pin takes a wire from each field it reads. */
export const Default: Story = {
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        await expect(await canvas.findByTestId('expression-node-tax')).toHaveTextContent('tax');
        await expect(canvas.getByTestId('expression-node-rate')).toBeInTheDocument();
        await expect(canvas.getByTestId('expression-node-city')).toBeInTheDocument();
    },
};

/** The flow of a service: `approved` reads the score node, so it is an expression node of the flow. */
export const InService: Story = {
    args: {model: SERVICE_MODEL, root: 'quote'},
    play: async ({canvasElement}) => {
        await expect(await within(canvasElement).findByTestId('expression-node-quote.approved')).toHaveTextContent(
            'approved',
        );
    },
};

/** The menu keeps only the host routes; no palette. */
export const ReadOnly: Story = {args: {readOnly: true}};
