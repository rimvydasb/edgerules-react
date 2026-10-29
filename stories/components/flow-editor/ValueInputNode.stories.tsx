import '@xyflow/react/dist/style.css';
import {useMemo, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, within} from 'storybook/test';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {createDocumentationService} from '../../../src/components/documentation-service';
import {createFlowEditorService, FlowEditor, type FlowLayout} from '../../../src/components/flow-editor';

// A single number and a single string, each read by a function; an output shows the score.
const VALUE_MODEL = `{
  func creditScore(age: number): 300 + age * 2
  func greeting(name: string): "Hello, " + name
  @InputNode(name: "Age")
  age: 23
  @InputNode(name: "Name")
  name: "Ann"
  @FunctionNode(name: "Score")
  score: creditScore(age: age)
  @FunctionNode(name: "Greeting")
  hello: greeting(name: name)
}`;

const LAYOUT: FlowLayout = {
    positions: {},
    outputs: [{id: 'output', label: 'Score', source: {node: 'score', handle: 'out:result'}}],
};

function Canvas({readOnly = false}: {readOnly?: boolean}): ReactElement {
    const service = useMemo(() => createFlowEditorService(MutableDecisionService.fromCode(VALUE_MODEL) as never), []);
    const documentation = useMemo(() => createDocumentationService(`value-input-story-${Math.random()}`), []);
    return (
        <div style={{width: '100%', height: 520}}>
            <FlowEditor
                service={service}
                documentation={documentation}
                languageService={MutableDecisionService}
                readOnly={readOnly}
                defaultLayout={LAYOUT}
                defaultPaletteCollapsed
            />
        </div>
    );
}

const meta: Meta<typeof Canvas> = {
    title: 'Components/Flow Editor/Value Input Node',
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

/** A single primitive value per node, with one output pin; click the value to edit it and the score recalculates. */
export const Default: Story = {
    play: async ({canvasElement}) => {
        const age = await within(canvasElement).findByTestId('value-input-node-age');
        await expect(within(age).getByRole('button', {name: 'Value of age'})).toHaveTextContent('23');
        await expect(within(canvasElement).getByTestId('value-input-node-name')).toHaveTextContent('"Ann"');
    },
};
/** Values are shown as code and cannot be edited; no node menu and no palette. */
export const ReadOnly: Story = {args: {readOnly: true}};
