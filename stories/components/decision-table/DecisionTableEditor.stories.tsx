import {useEffect, useState, type ReactElement} from 'react';
import {Box, Text} from '@mantine/core';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {MutableDecisionService} from '@edgerules/web/mutable';
import {DecisionTableEditor} from '../../../src/components/decision-table';
import type {ProjectEngine} from '../../../src/components/project-session';
import {
    BEST_MATCH_MODEL_DSL,
    RISK_MODEL_DSL,
    SCORECARD_MODEL_DSL,
} from '../../../src/components/decision-table/testing/model.dsl';
import {openStoryProject} from '../../support/storyProject';

async function buildService(code: string): Promise<ProjectEngine> {
    return (await openStoryProject(code)).engine;
}

function EditorHarness({
    service,
    path,
    resultPath,
    readOnly = false,
}: {
    service: ProjectEngine;
    path: string;
    resultPath: string;
    readOnly?: boolean;
}): ReactElement {
    const [version, setVersion] = useState(0);
    const [result, setResult] = useState('Loading…');

    useEffect(() => {
        let active = true;
        service.execute(resultPath).then(
            (value) => {
                if (active) setResult(JSON.stringify(value));
            },
            (error: unknown) => {
                if (active) {
                    setResult(String((error as {message?: string}).message ?? error));
                }
            },
        );
        return () => {
            active = false;
        };
    }, [service, resultPath, version]);

    return (
        <Box maw={980}>
            <DecisionTableEditor
                service={service}
                path={path}
                languageService={MutableDecisionService}
                readOnly={readOnly}
                onChange={() => setVersion((current) => current + 1)}
            />
            <Text size="xs" data-testid="live-result" mt="xs">
                {resultPath}: {result}
            </Text>
        </Box>
    );
}

const meta: Meta<typeof DecisionTableEditor> = {
    title: 'Decision Table/DecisionTableEditor',
    component: DecisionTableEditor,
    parameters: {
        docs: {
            description: {
                component:
                    'DMN-style decision table editor over an EdgeRules first-class `ruleset`: input ' +
                    'columns from the parameters, output columns from the `then` shape, hit-policy ' +
                    'selection, a pinned default row, boolean-expression rows, and scorecard support. ' +
                    'Display cells are statically highlighted; the full CodeEditorCell mounts only on ' +
                    'the cell being edited.',
            },
        },
    },
};

export default meta;

type Story = StoryObj<typeof DecisionTableEditor>;

export const DecisionTable: Story = {
    loaders: [async () => ({service: await buildService(RISK_MODEL_DSL)})],
    render: (_args, {loaded}) => (
        <EditorHarness service={loaded.service as ProjectEngine} path="risk" resultPath="decision" />
    ),
};

export const Scorecard: Story = {
    loaders: [async () => ({service: await buildService(SCORECARD_MODEL_DSL)})],
    render: (_args, {loaded}) => (
        <EditorHarness service={loaded.service as ProjectEngine} path="scoreFactors" resultPath="total" />
    ),
};

export const BestMatchPriorities: Story = {
    loaders: [async () => ({service: await buildService(BEST_MATCH_MODEL_DSL)})],
    render: (_args, {loaded}) => (
        <EditorHarness service={loaded.service as ProjectEngine} path="tier" resultPath="result" />
    ),
};

export const ReadOnly: Story = {
    loaders: [async () => ({service: await buildService(RISK_MODEL_DSL)})],
    render: (_args, {loaded}) => (
        <EditorHarness service={loaded.service as ProjectEngine} path="risk" resultPath="decision" readOnly />
    ),
};
