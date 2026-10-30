import '@xyflow/react/dist/style.css';
import {useMemo, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, within} from 'storybook/test';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {createDocumentationService} from '../../../src/components/documentation-service';
import {createFlowEditorService, FlowEditor} from '../../../src/components/flow-editor';
import {SERVICE_MODEL} from '../../../src/components/flow-editor/testing/serviceModel';

// The `quote` service: its return context returns the score and the installment; a caller reads the installment.
// `model` and `root` show another service, for example one that returns an expression.
function Canvas({
    readOnly = false,
    model = SERVICE_MODEL,
    root = 'quote',
}: {
    readOnly?: boolean;
    model?: string;
    root?: string;
}): ReactElement {
    const service = useMemo(
        () => createFlowEditorService(MutableDecisionService.fromCode(model) as never, {root}),
        [model, root],
    );
    const documentation = useMemo(() => createDocumentationService(`return-story-${Math.random()}`), []);
    return (
        <div style={{width: '100%', height: 520}}>
            <FlowEditor
                service={service}
                documentation={documentation}
                languageService={MutableDecisionService}
                readOnly={readOnly}
                defaultPaletteCollapsed
            />
        </div>
    );
}

const meta: Meta<typeof Canvas> = {
    title: 'Components/Flow Editor/Return Node',
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

/**
 * The values the service returns, each with its expression and no computed value. Wire a pin of a parameter or a node
 * into "Wire a value here" to add it; the installment stays while the caller reads it.
 */
export const Default: Story = {
    play: async ({canvasElement}) => {
        const result = await within(canvasElement).findByTestId('return-node-quote.return');
        await expect(result).toHaveTextContent('Quote');
        await expect(within(result).getByTestId('return-add-row')).toBeInTheDocument();
    },
};
/** Expressions show as code; no add row and no menu edits. */
export const ReadOnly: Story = {args: {readOnly: true}};

/** A `return` expression: one row with its text, and one wire for each field it reads into its one input pin. */
export const Expression: Story = {
    args: {
        model: `{
  @Service
  func total(price: number, quantity: number): {
    subtotal: price * quantity
    tax: subtotal * 0.2
    return: subtotal + tax
  }
}`,
        root: 'total',
    },
    play: async ({canvasElement}) => {
        const node = await within(canvasElement).findByTestId('return-node-total.return');
        await expect(node).toHaveTextContent('subtotal + tax');
        await expect(within(node).queryByTestId('return-add-row')).toBeNull();
    },
};
