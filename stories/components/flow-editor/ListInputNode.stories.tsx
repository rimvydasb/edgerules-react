import '@xyflow/react/dist/style.css';
import {useMemo, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {init, MutableDecisionService} from '@edgerules/web/mutable';
import {createDocumentationService} from '../../../src/components/documentation-service';
import {createFlowEditorService, FlowEditor, type FlowLayout} from '../../../src/components/flow-editor';

// A list of records and a list of numbers, each read as a whole by a function.
const LIST_MODEL = `{
  type Person: { id: <string>; name: <string>; age: <number> }
  func oldest(people: Person[]): { age: max(for p in people return p.age); count: count(people) }
  func total(values: number[]): sum(values)
  @InputNode(name: "People")
  people: [{ id: "P1"; name: "Ann"; age: 34 }, { id: "P2"; name: "Bo"; age: 51 }, { id: "P3"; name: "Cy"; age: 27 }]
  @InputNode(name: "Scores")
  scores: [12, 7, 30]
  @FunctionNode(name: "Oldest age")
  pick: oldest(people: people)
  @FunctionNode(name: "Total score")
  sumScores: total(values: scores)
}`;

const LAYOUT: FlowLayout = {
    positions: {},
    outputs: [{id: 'output', label: 'Oldest age', source: {node: 'pick', handle: 'out:age'}}],
};

function Canvas({readOnly = false}: {readOnly?: boolean}): ReactElement {
    const service = useMemo(() => createFlowEditorService(MutableDecisionService.fromCode(LIST_MODEL) as never), []);
    const documentation = useMemo(() => createDocumentationService(`list-input-story-${Math.random()}`), []);
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
    title: 'Components/Flow Editor/List Input Node',
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

/** Each list feeds a function through its one whole-list pin; the body shows the shape of an item. */
export const Default: Story = {};
/** No node menu and no palette. */
export const ReadOnly: Story = {args: {readOnly: true}};
