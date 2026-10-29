import type {PortableNode} from '@edgerules/portable';
import {SERVICE_ANNOTATION, WORKBOOK_ANNOTATION, type ExplorerEntryKind, type ExplorerSection} from './tree-model';

/** One "New …" item of a section menu. */
export interface CreateOption {
    kind: ExplorerEntryKind;
    label: string;
    defaultName: string; // the start of the proposed name; a number makes it unique
    template: () => PortableNode;
}

const EMPTY_BODY = {'@kind': 'context', result: 0};

// The smallest valid entity of each kind; the user completes it in the opened editor.
// A method is a function or a ruleset; a service is a function with `@Service`. Input, output and chart nodes exist
// only inside a workbook, so no section offers them: the Flow Editor of the workbook creates them.
export const CREATE_OPTIONS: Record<Exclude<ExplorerSection, 'tests'>, CreateOption[]> = {
    types: [
        {
            kind: 'type',
            label: 'Type',
            defaultName: 'NewType',
            template: () => ({'@kind': 'type-definition', value: {'@kind': 'type', type: 'string'}}) as PortableNode,
        },
    ],
    methods: [
        {
            kind: 'function',
            label: 'Function',
            defaultName: 'newFunction',
            template: () => ({'@kind': 'function', '@parameters': {}, '@body': EMPTY_BODY}) as PortableNode,
        },
        {
            kind: 'ruleset',
            label: 'Ruleset',
            defaultName: 'newRuleset',
            template: () =>
                ({
                    '@kind': 'ruleset',
                    '@parameters': {value: 'number'},
                    '@hitPolicy': 'first-match',
                    '@rules': [],
                    '@default': EMPTY_BODY,
                }) as PortableNode,
        },
    ],
    services: [
        {
            kind: 'service',
            label: 'Service',
            defaultName: 'newService',
            template: () =>
                ({
                    '@kind': 'function',
                    '@node': SERVICE_ANNOTATION,
                    '@parameters': {},
                    '@body': EMPTY_BODY,
                }) as PortableNode,
        },
    ],
    variables: [
        {kind: 'variable', label: 'Value', defaultName: 'newValue', template: () => 0},
        {
            kind: 'context',
            label: 'Context',
            defaultName: 'newContext',
            template: () => ({'@kind': 'context'}) as PortableNode,
        },
    ],
    workbooks: [
        {
            kind: 'workbook',
            label: 'Workbook',
            defaultName: 'newWorkbook',
            template: () => ({'@kind': 'context', '@node': WORKBOOK_ANNOTATION}) as PortableNode,
        },
    ],
};

/** `base`, or `base2`, `base3`, … : the first name that `taken` does not hold. */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
    if (!taken.has(base)) return base;
    let index = 2;
    while (taken.has(`${base}${index}`)) index++;
    return `${base}${index}`;
}
