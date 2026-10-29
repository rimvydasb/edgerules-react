import type {FlowEditorService} from '../flow-editor-types';
import type {PaletteGroup, PaletteItem} from './types';

export const DRAG_TYPE = 'application/x-edgerules-flow-node';

export const GROUP_LABEL: Record<PaletteGroup, string> = {
    input: 'Inputs',
    function: 'Functions & rulesets',
    output: 'Outputs',
    chart: 'Charts',
};

export const GROUP_ORDER: PaletteGroup[] = ['input', 'function', 'output', 'chart'];

/** Every node the palette offers: one generic item per node type, then the model items of that type. */
export function paletteItems(service: FlowEditorService): PaletteItem[] {
    const items: PaletteItem[] = [
        {
            id: 'new-input',
            group: 'input',
            icon: 'input',
            title: 'New input',
            detail: 'Empty record with one field',
            label: 'Add new input',
            action: {kind: 'new-input'},
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
            title: 'Function call',
            detail: 'Pick the callee on the node',
            label: 'Add function call',
            action: {kind: 'function'},
        },
        ...service.listCallees().map((callee): PaletteItem => ({
            id: `callee:${callee.path}`,
            group: 'function',
            icon: callee.kind,
            title: callee.path,
            detail: `(${callee.parameters.map((parameter) => parameter.name).join(', ')}) → ${callee.returnLabel}`,
            label: `Add ${callee.kind} ${callee.path}`,
            action: {kind: 'function', callee: callee.path},
        })),
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
