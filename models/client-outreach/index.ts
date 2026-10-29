import type {ProjectBundleInput} from '../../src/components/project-session';
import {CLIENTS} from './clients';
import {CLIENT_OUTREACH_DOCUMENTATION} from './documentation';
import {CLIENT_OUTREACH_FLOW} from './flow';
import {CLIENT_OUTREACH_DSL} from './model';
import {CLIENT_OUTREACH_TESTS} from './tests';

export type {Client} from './clients';
export {CLIENTS, CLIENT_OUTREACH_DOCUMENTATION, CLIENT_OUTREACH_DSL, CLIENT_OUTREACH_FLOW, CLIENT_OUTREACH_TESTS};

/** The client outreach project: pass it to `ProjectFactory.createBundle`. The model needs an optimisation solver. */
export const CLIENT_OUTREACH_PROJECT: ProjectBundleInput = {
    name: 'Client outreach',
    description: 'Decides whom to call, email or text in one working day for the largest expected revenue',
    tags: ['sales', 'outreach', 'optimisation', 'decision-table', 'workbook'],
    model: {dsl: CLIENT_OUTREACH_DSL, name: 'Client Outreach Planner', version: '1.0.0'},
    documentation: CLIENT_OUTREACH_DOCUMENTATION,
    tests: CLIENT_OUTREACH_TESTS,
    flow: CLIENT_OUTREACH_FLOW,
};
