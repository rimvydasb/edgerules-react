import {
    IconArrowDown,
    IconArrowUp,
    IconCode,
    IconExternalLink,
    IconNote,
    IconNoteOff,
    IconTag,
    IconTrash,
} from '@tabler/icons-react';
import type {RowMenuItem} from '#ui/RowActionsMenu';
import {startGroup} from '../core-node';
import type {ReturnFieldMenuContext, ReturnNodeMenuContext} from './types';

/**
 * The ReturnNode menu: "This node", "Return" with the host routes, then "Remove". The return is always on the flow of
 * its service: Delete removes the `return` field, so the service returns every field of its body again. Read-only mode
 * keeps the routes.
 */
export function returnNodeMenuItems(context: ReturnNodeMenuContext): RowMenuItem[] {
    const {readOnly, onOpenNode, field} = context;
    const items: RowMenuItem[] = [];
    if (!readOnly) {
        const thisNode: RowMenuItem[] = [
            {id: 'rename-node', label: 'Rename node', icon: IconTag, onSelect: context.onRenameNode},
        ];
        if (context.canDescribe) {
            thisNode.push(
                context.hasDescription
                    ? {
                          id: 'remove-description',
                          label: 'Remove description',
                          icon: IconNoteOff,
                          onSelect: context.onRemoveDescription,
                      }
                    : {
                          id: 'add-description',
                          label: 'Add description',
                          icon: IconNote,
                          onSelect: context.onAddDescription,
                      },
            );
        }
        items.push(...startGroup(thisNode, 'This node'));
    }
    if (onOpenNode) {
        items.push(
            ...startGroup(
                [
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
                ],
                'Return',
            ),
        );
    }
    if (!readOnly) {
        items.push(
            ...startGroup(
                [{id: 'delete', label: 'Delete', icon: IconTrash, danger: true, onSelect: context.onDelete}],
                'Remove',
            ),
        );
    }
    return items;
}

/** The menu of one return field: move it, or take it out of the return. The engine refuses what a caller reads. */
export function returnFieldMenuItems({model, item, onMove, onDelete}: ReturnFieldMenuContext): RowMenuItem[] {
    const index = model.fields.findIndex((candidate) => candidate.name === item.name);
    return [
        {id: 'move-up', label: 'Move up', icon: IconArrowUp, disabled: index === 0, onSelect: () => onMove('up')},
        {
            id: 'move-down',
            label: 'Move down',
            icon: IconArrowDown,
            disabled: index === model.fields.length - 1,
            onSelect: () => onMove('down'),
        },
        {id: 'delete-field', label: 'Delete field', icon: IconTrash, danger: true, onSelect: onDelete},
    ];
}
