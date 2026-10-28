import type {FlowMetadataDocument} from '../../src/components/project-session';

/**
 * `flow.json` of the loan origination project: the outputs and the charts of both workbooks. Node positions are empty,
 * so the Flow Editor places every node with its automatic layout.
 */
export const LOAN_ORIGINATION_FLOW: FlowMetadataDocument = {
    schemaVersion: 2,
    layouts: {
        originationBook: {
            positions: {},
            outputs: [
                {
                    id: 'output',
                    label: 'Decision',
                    source: {node: 'originationBook.origination', handle: 'out:decision'},
                },
                {
                    id: 'output2',
                    label: 'Offer',
                    source: {node: 'originationBook.origination', handle: 'out:offer'},
                },
                {
                    id: 'output3',
                    label: 'Affordability',
                    source: {node: 'originationBook.origination', handle: 'out:affordability'},
                },
                {
                    id: 'output4',
                    label: 'Household risk grade',
                    source: {node: 'originationBook.origination', handle: 'out:grade'},
                },
            ],
            charts: [
                {
                    id: 'chart',
                    label: 'Main applicant scorecard',
                    source: {node: 'originationBook.mainScorecard', handle: 'out:bins'},
                    config: {kind: 'bar', x: 'characteristic', series: ['points']},
                    size: {width: 480, height: 300},
                },
                {
                    id: 'chart2',
                    label: 'Co-applicant scorecard',
                    source: {node: 'originationBook.coScorecard', handle: 'out:bins'},
                    config: {kind: 'bar', x: 'characteristic', series: ['points']},
                    size: {width: 480, height: 300},
                },
            ],
        },
        capacityBook: {
            positions: {},
            outputs: [
                {
                    id: 'output',
                    label: 'Capacity by term',
                    source: {node: 'capacityBook.capacity', handle: 'out:result'},
                },
            ],
            charts: [
                {
                    id: 'chart',
                    label: 'Largest affordable loan',
                    source: {node: 'capacityBook.capacity', handle: 'out:result'},
                    config: {kind: 'bar', x: 'termYears', series: ['maxLoan']},
                    size: {width: 520, height: 320},
                },
            ],
        },
    },
};
