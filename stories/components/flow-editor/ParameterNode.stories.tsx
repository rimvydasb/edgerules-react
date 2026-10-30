import '@xyflow/react/dist/style.css';
import {useMemo, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, within} from 'storybook/test';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {createDocumentationService} from '../../../src/components/documentation-service';
import {createFlowEditorService, FlowEditor} from '../../../src/components/flow-editor';
import {SERVICE_MODEL} from '../../../src/components/flow-editor/testing/serviceModel';

// The `quote` service: a record parameter typed `Applicant` and a number parameter, wired into two invocations.
function Canvas({readOnly = false}: {readOnly?: boolean}): ReactElement {
    const service = useMemo(
        () => createFlowEditorService(MutableDecisionService.fromCode(SERVICE_MODEL) as never, {root: 'quote'}),
        [],
    );
    const documentation = useMemo(() => createDocumentationService(`parameter-story-${Math.random()}`), []);
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
    title: 'Components/Flow Editor/Parameter Node',
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
 * Each parameter of the service, drawn from its type: a record type has a pin per field, no value. Rename a parameter
 * from its menu: the body and the caller follow.
 */
export const Default: Story = {
    play: async ({canvasElement}) => {
        const applicant = await within(canvasElement).findByTestId('parameter-node-quote.applicant');
        await expect(applicant).toHaveTextContent('Applicant');
        await expect(within(canvasElement).getByTestId('parameter-node-quote.amount')).toHaveTextContent('number');
    },
};
/** Parameters cannot change; the menu opens the record type only. */
export const ReadOnly: Story = {args: {readOnly: true}};
