import '@xyflow/react/dist/style.css';
import {useMemo, useState, type ReactElement} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, userEvent, within} from 'storybook/test';
import {MutableDecisionService} from '@edgerules/web/mutable';
import {createFlowEditorService, FlowEditor, type FlowLayout} from '../../../src/components/flow-editor';
import {
    ProjectProvider,
    useProjectSession,
    useProjectSlice,
    useProjectSnapshot,
    type ProjectSession,
} from '../../../src/components/project-session';
import {openStoryProject} from '../../support/storyProject';

// The sample model of the FunctionNode design proposal.
const SAMPLE_MODEL = `{
  type Applicant: { age: <number>; income: <number>; segment: <string> }
  applicant: { age: 23; income: 25000; segment: "retail" }
  application: { amount: 32000 }
  ruleset risk(age: number, income: number, segment: string): {
    hitPolicy: "first-match"
    rules: [
      { when: { age: 18..25, income: < 30000, segment: "retail" }, then: { level: "high", limit: 1000 } }
      { when: { age: >= 26 }, then: { level: "medium", limit: 5000 } }
    ]
    default: { level: "none", limit: 0 }
  }
  func creditScore(age: number, income: number): 300 + age * 2 + income / 1000
  func monthly(amount: number): amount / 12
  func applicantDecision(person: Applicant): { eligible: person.age >= 18; reason: if person.age >= 18 then "adult" else "minor" }
  decision: risk(age: applicant.age, income: applicant.income, segment: applicant.segment)
  score: creditScore(age: applicant.age, income: applicant.income)
  payment: monthly(amount: application.amount * 1.1)
  eligibility: applicantDecision(person: applicant)
}`;

const FLOW_LAYOUT: FlowLayout = {
    positions: {},
    outputs: [
        {id: 'output', label: 'Risk level', source: {node: 'decision', handle: 'out:level'}},
        {id: 'output2', label: 'Credit score', source: {node: 'score', handle: 'out:result'}},
    ],
};

interface EditorArgs {
    seeded?: boolean; // the applicant input, the decision and score functions and two outputs are on the canvas
    readOnly?: boolean;
    showLayout?: boolean; // prints the layout the session's flow store holds once onLayoutChange changed it
}

// The story's project: the seeded variant starts with a description and the outputs in its flow layout.
function openProject({seeded = false}: EditorArgs): Promise<ProjectSession> {
    return openStoryProject({
        name: 'Flow story',
        model: {dsl: SAMPLE_MODEL},
        ...(seeded && {
            documentation: {
                schemaVersion: 1,
                byPath: {decision: 'Assess the applicant risk band from age, income and segment'},
            },
            flow: {schemaVersion: 1, layout: FLOW_LAYOUT},
        }),
    });
}

function Editor({seeded = false, readOnly = false, showLayout = false}: EditorArgs): ReactElement {
    const session = useProjectSession();
    const service = useMemo(() => {
        const created = createFlowEditorService(session.engine);
        if (seeded) {
            created.addInputNode('applicant');
            // Writes the same invocations with @node: FunctionNode, keeping their bindings.
            created.setCallee('decision', 'risk');
            created.setCallee('score', 'creditScore');
        }
        return created;
    }, [session, seeded]);
    // Read on mount only, like FlowEditor's own `defaultLayout`.
    const [defaultLayout] = useState<FlowLayout>(() => session.flow.getLayout());

    return (
        <div style={{height: '100vh', display: 'flex', flexDirection: 'column'}}>
            <div style={{flex: 1, minHeight: 0}}>
                <FlowEditor
                    service={service}
                    documentation={session.documentation}
                    languageService={MutableDecisionService}
                    readOnly={readOnly}
                    defaultLayout={defaultLayout}
                    onLayoutChange={session.flow.setLayout}
                />
            </div>
            {showLayout && <LayoutReport />}
        </div>
    );
}

function LayoutReport(): ReactElement {
    const {layout} = useProjectSlice('flow');
    const {dirtySlices} = useProjectSnapshot();
    return (
        <pre data-testid="layout-json" style={{margin: 0, padding: 8, maxHeight: 120, overflow: 'auto', fontSize: 11}}>
            {dirtySlices.includes('flow') ? JSON.stringify(layout) : 'no layout change yet'}
        </pre>
    );
}

const meta: Meta<typeof Editor> = {
    title: 'Flow Editor/FlowEditor',
    component: Editor,
    parameters: {layout: 'fullscreen'},
    loaders: [async ({args}) => ({session: await openProject(args)})],
    render: (args, {loaded}) => (
        <ProjectProvider session={loaded.session as ProjectSession}>
            <Editor {...args} />
        </ProjectProvider>
    ),
};
export default meta;

type Story = StoryObj<typeof Editor>;

/** An input, two function nodes and two outputs, placed by the automatic layout. */
export const Default: Story = {args: {seeded: true}};

/** No node is annotated for the flow yet: the canvas shows how to start. */
export const Empty: Story = {args: {}};

/** No palette, no wiring and no removal. */
export const ReadOnly: Story = {args: {seeded: true, readOnly: true}};

/** Prints what onLayoutChange reports, for hosts that persist `flow.json`. */
export const LayoutChanges: Story = {args: {showLayout: true}};

// xyflow hides a node until it is measured, so the first lookup waits longer than the default.
const SLOW = {timeout: 8000};

/** Clicks a palette item: the node appears in the middle of the canvas. */
export const AddFromPalette: Story = {
    args: {},
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        await userEvent.click(await canvas.findByRole('button', {name: 'Add ruleset risk'}, SLOW));
        await expect(await canvas.findByTestId('function-node-node', {}, SLOW)).toBeVisible();
    },
};
