import type {FlowEditorService} from '../flow-editor-types';
import type {PaletteGroup, PaletteItem} from './types';

export const DRAG_TYPE = 'application/x-edgerules-flow-node';

export const GROUP_LABEL: Record<PaletteGroup, string> = {
    input: 'Inputs',
    function: 'Invocations',
    output: 'Outputs',
    chart: 'Charts',
};

export const GROUP_ORDER: PaletteGroup[] = ['input', 'function', 'output', 'chart'];

/**
 * Every node the palette offers: a new input of each kind and the records and lists of the model, one Invocation that
 * picks what it invokes on the node, an Output and a Chart.
 */
export function paletteItems(service: FlowEditorService): PaletteItem[] {
    const items: PaletteItem[] = [
        {
            id: 'new-input',
            group: 'input',
            icon: 'input',
            title: 'Object input',
            detail: 'Record with one field',
            label: 'Add object input',
            action: {kind: 'new-input', input: 'object-input'},
        },
        {
            id: 'new-list-input',
            group: 'input',
            icon: 'list-input',
            title: 'List input',
            detail: 'List of numbers',
            label: 'Add list input',
            action: {kind: 'new-input', input: 'list-input'},
        },
        {
            id: 'new-value-input',
            group: 'input',
            icon: 'value-input',
            title: 'Value input',
            detail: 'One number',
            label: 'Add value input',
            action: {kind: 'new-input', input: 'value-input'},
        },
        ...service.listInputCandidates().map(({field, kind}): PaletteItem => ({
            id: `input:${field}`,
            group: 'input',
            icon: kind === 'list-input' ? 'list-input' : 'input',
            title: field,
            detail: kind === 'list-input' ? 'Existing list' : 'Existing record',
            label: `Add input ${field}`,
            action: {kind: 'input', field},
        })),
        {
            id: 'function',
            group: 'function',
            icon: 'function',
            title: 'Invocation',
            detail: 'Pick a function or ruleset on the node',
            label: 'Add invocation',
            action: {kind: 'function'},
        },
        {
            id: 'output',
            group: 'output',
            icon: 'output',
            title: 'Output',
            detail: 'Shows the value of a wired result',
            label: 'Add output',
            action: {kind: 'output'},
        },
        {
            id: 'chart',
            group: 'chart',
            icon: 'chart',
            title: 'Chart',
            detail: 'Draws a wired list as a chart',
            label: 'Add chart',
            action: {kind: 'chart'},
        },
    ];
    return items;
}

/** Items whose title or detail contains every word of the query, ignoring case. */
export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return items;
    return items.filter((item) => {
        const text = `${item.title} ${item.detail} ${GROUP_LABEL[item.group]}`.toLowerCase();
        return words.every((word) => text.includes(word));
    });
}
