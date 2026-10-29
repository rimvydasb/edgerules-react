import '@xyflow/react/dist/style.css';
import {useMemo, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, waitFor, within} from 'storybook/test';
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

// A list of plain values only: no item fields, one table row per value.
const PRIMITIVE_MODEL = `{
  @InputNode(name: "Cities")
  cities: ["Vilnius", "Kaunas", "Klaipėda", "Šiauliai"]
}`;

// More items than the node shows: it ends with a row of `…`.
const LONG_MODEL = `{
  @InputNode(name: "Monthly rates")
  rates: [1.5, 1.6, 1.7, 1.75, 1.8, 1.9, 2.0, 2.1, 2.2, 2.25, 2.3, 2.4, 2.5, 2.6]
}`;

const LAYOUT: FlowLayout = {
    positions: {},
    outputs: [{id: 'output', label: 'Oldest age', source: {node: 'pick', handle: 'out:age'}}],
};

function Canvas({
    model = LIST_MODEL,
    layout = LAYOUT,
    readOnly = false,
}: {
    model?: string;
    layout?: FlowLayout;
    readOnly?: boolean;
}): ReactElement {
    const service = useMemo(() => createFlowEditorService(MutableDecisionService.fromCode(model) as never), [model]);
    const documentation = useMemo(() => createDocumentationService(`list-input-story-${Math.random()}`), []);
    return (
        <div style={{width: '100%', height: 520}}>
            <FlowEditor
                service={service}
                documentation={documentation}
                languageService={MutableDecisionService}
                readOnly={readOnly}
                defaultLayout={layout}
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

/** Each list feeds a function through its one whole-list pin; the body shows the items as a table. */
export const Default: Story = {};
/** No node menu and no palette. */
export const ReadOnly: Story = {args: {readOnly: true}};

/** A list of plain strings: one row per value, under a `value` column. */
export const PrimitiveList: Story = {
    args: {model: PRIMITIVE_MODEL, layout: {positions: {}, outputs: []}},
    play: async ({canvasElement}) => {
        const node = await within(canvasElement).findByTestId('list-input-node-cities');
        await waitFor(() => expect(within(node).getByTestId('list-input-table')).toHaveTextContent('Klaipėda'));
        await expect(node).toHaveTextContent('string[] · 4 items');
    },
};

/** Fourteen items: the node shows the first 10, then a row of `…`. */
export const LongList: Story = {
    args: {model: LONG_MODEL, layout: {positions: {}, outputs: []}},
    play: async ({canvasElement}) => {
        const node = await within(canvasElement).findByTestId('list-input-node-rates');
        await waitFor(() => expect(within(node).getByTestId('list-input-more-rows')).toBeInTheDocument());
    },
};
