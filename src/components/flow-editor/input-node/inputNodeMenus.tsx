import {IconCode, IconExternalLink, IconPlus} from '@tabler/icons-react';
import type {ReactNode} from 'react';
import type {RowMenuItem} from '#ui/RowActionsMenu';
import {coreNodeMenuItems, rowMenuItems} from '../core-node';
import type {InputFieldMenuContext, InputNodeMenuContext, InputNodeModel} from './types';

/** The InputNode menu: the core groups plus the "Record" group with Add field and the host routes. */
export function inputNodeMenuItems(context: InputNodeMenuContext): RowMenuItem[] {
    const {readOnly, onOpenNode, field} = context;

    const recordItems: RowMenuItem[] = [];
    if (!readOnly) {
        recordItems.push({id: 'add-field', label: 'Add field', icon: IconPlus, onSelect: context.onAddField});
    }
    if (onOpenNode) {
        recordItems.push(
            {
                id: 'open-editor',
                label: 'Open in boxed editor',
                icon: IconExternalLink,
                onSelect: () => onOpenNode({path: field, kind: 'boxed-editor'}),
            },
            {
                id: 'view-code',
                label: 'View as code',
                icon: IconCode,
                onSelect: () => onOpenNode({path: field, kind: 'code-editor'}),
            },
        );
    }

    return coreNodeMenuItems(context, {middle: recordItems, middleGroup: 'Record'});
}

/** The field menu of an InputNode: the argument menu of the FunctionNode, for a record field. */
export function inputFieldMenuItems({model, item, onMove, onAddBelow, onDelete}: InputFieldMenuContext): RowMenuItem[] {
    return rowMenuItems({
        noun: 'field',
        index: model.fields.findIndex((candidate) => candidate.name === item.name),
        count: model.fields.length,
        used: item.used,
        usedReason: `Read as ${model.field}.${item.name}`,
        onMove,
        onAddBelow,
        onDelete,
    });
}

export function inputFieldMenuFooter(model: InputNodeModel): ReactNode {
    return (
        <>
            Changes <code>{model.field}</code>
        </>
    );
}
