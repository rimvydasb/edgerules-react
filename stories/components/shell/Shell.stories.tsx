import '@xyflow/react/dist/style.css';
import {useState, type ReactElement} from 'react';
import {Code, Group, Text} from '@mantine/core';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, userEvent, within} from 'storybook/test';
import {MutableDecisionService} from '@edgerules/web/mutable';
import {ProjectProvider, type ProjectSession} from '../../../src/components/project-session';
import {Shell, type ShellView} from '../../../src/components/shell';
import {openStoryProject} from '../../support/storyProject';

// The sample model of docs/model-decomposition.md. `risk` is an invocation, so the Flow view shows it as a
// FunctionNode; `applicant.calculateAge` shows a function root path.
const SAMPLE_MODEL = `{
  type Customer: { name: <string>; income: <number, 0> }
  func riskScore(income: number): { score: income / 100 }
  @InputNode
  applicant: {
    age: 21
    address: {
      city: "Vilnius"
      zip: "01100"
    }
    func calculateAge(year: number): { result: 2026 - year }
  }
  @FunctionNode
  risk: riskScore(applicant.age)
  limit: riskScore(applicant.age).score
}`;

// A project with an entity of every Project Explorer section: a service method, a workbook with its nodes, and tests.
const PROJECT_MODEL = `{
  type Customer: { name: <string>; income: <number, 0> }
  func riskScore(income: number): { score: income / 100 }
  @Service
  func processApplication(income: number): { result: riskScore(income).score }
  ruleset band(age: number): {
    hitPolicy: "first-match"
    rules: [{ when: { age: < 30 }, then: { level: "young" } }]
    default: { level: "none" }
  }
  limit: 1000
  @Workbook
  loanBook: {
    @InputNode(name: "Applicant")
    applicant: { income: 5000 }
    @FunctionNode
    decision: riskScore(income: applicant.income)
  }
}`;

interface ShellStoryArgs {
    defaultPath?: string;
    defaultView?: ShellView;
    readOnly?: boolean;
    defaultExplorerOpen?: boolean;
    controlled?: boolean; // the host holds the path and the view, and prints them
}

function HostedShell({
    defaultPath,
    defaultView,
    readOnly,
    defaultExplorerOpen,
    controlled,
}: ShellStoryArgs): ReactElement {
    const [path, setPath] = useState(defaultPath ?? '*');
    const [view, setView] = useState<ShellView>(defaultView ?? 'boxed');
    const [forwarded, setForwarded] = useState<string>();
    return (
        <div style={{height: '100vh', display: 'flex', flexDirection: 'column', padding: 12, boxSizing: 'border-box'}}>
            {controlled && (
                <Group gap="md" mb="xs" data-testid="host-state">
                    <Text size="xs">
                        path <Code>{path}</Code>
                    </Text>
                    <Text size="xs">
                        view <Code>{view}</Code>
                    </Text>
                    {forwarded && (
                        <Text size="xs">
                            forwarded to the host <Code>{forwarded}</Code>
                        </Text>
                    )}
                </Group>
            )}
            <div style={{flex: 1, minHeight: 0}}>
                <Shell
                    languageService={MutableDecisionService}
                    readOnly={readOnly}
                    defaultExplorerOpen={defaultExplorerOpen}
                    {...(controlled
                        ? {path, onPathChange: setPath, view, onViewChange: setView}
                        : {defaultPath, defaultView})}
                    onOpenNode={(target) => setForwarded(`${target.kind} ${target.path}`)}
                />
            </div>
        </div>
    );
}

const meta: Meta<typeof HostedShell> = {
    title: 'Shell/Shell',
    component: HostedShell,
    parameters: {layout: 'fullscreen'},
    loaders: [async () => ({session: await openStoryProject({name: 'Shell story', model: {dsl: SAMPLE_MODEL}})})],
    render: (args, {loaded}) => (
        <ProjectProvider session={loaded.session as ProjectSession}>
            <HostedShell {...args} />
        </ProjectProvider>
    ),
};
export default meta;

type Story = StoryObj<typeof HostedShell>;

/** The whole model in the Boxed view. */
export const Default: Story = {args: {}};

/** The Project Explorer collapsed to its rail of section icons; an icon opens the panel with that section. */
export const CollapsedProjectExplorer: Story = {args: {defaultExplorerOpen: false}};

/** The DSL code of a context path; an edit commits after 500 ms without typing. */
export const CodeOfAContext: Story = {args: {defaultPath: 'applicant', defaultView: 'code'}};

/** A function path: the breadcrumb ends with `calculateAge(...)`, and the Boxed view shows its body. */
export const FunctionPath: Story = {args: {defaultPath: 'applicant.calculateAge'}};

/** The Flow Component nodes that are direct fields of the model root. */
export const Flow: Story = {args: {defaultView: 'flow'}};

/** Every editor is read-only. */
export const ReadOnly: Story = {args: {readOnly: true}};

/** The host holds the path and the view; drill-downs the Shell does not open go to the host. */
export const Controlled: Story = {
    args: {controlled: true, defaultPath: 'applicant.address'},
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        await userEvent.click(await canvas.findByRole('button', {name: 'applicant'}));
        await expect(canvas.getByTestId('host-state')).toHaveTextContent('path applicant');
        await userEvent.click(canvas.getByText('Code'));
        await expect(canvas.getByTestId('host-state')).toHaveTextContent('view code');
    },
};

/**
 * The Project Explorer of a whole project, in the Flow view. The workbook opens as the Flow root, a click on its
 * `decision` node centers that node, and the tests of `riskScore` open in the Tests view.
 */
export const Project: Story = {
    args: {defaultExplorerOpen: true, defaultView: 'flow'},
    loaders: [
        async () => {
            const session = await openStoryProject({name: 'Shell project story', model: {dsl: PROJECT_MODEL}});
            session.tests.forSubject('riskScore').addTestCase();
            return {session};
        },
    ],
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        const explorer = await canvas.findByRole('navigation', {name: 'Project explorer'});
        await userEvent.click(within(explorer).getByText('loanBook'));
        await expect(canvas.getByRole('radio', {name: 'Flow'})).toHaveAttribute('aria-checked', 'true');
        await userEvent.click(await within(explorer).findByText('decision'));
        await expect(canvas.getByRole('radio', {name: 'Flow'})).toHaveAttribute('aria-checked', 'true');
        // The second `riskScore()` is the entry of the Tests section.
        await userEvent.click(within(explorer).getAllByText('riskScore()')[1]!);
        await expect(await canvas.findByTestId('shell-tests-view')).toBeInTheDocument();
    },
};
