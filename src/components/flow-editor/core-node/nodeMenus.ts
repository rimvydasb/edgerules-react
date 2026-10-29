import {
    IconArrowDown,
    IconArrowUp,
    IconCopy,
    IconEyeOff,
    IconNote,
    IconNoteOff,
    IconPencil,
    IconPlus,
    IconTag,
    IconTrash,
} from '@tabler/icons-react';
import type {ReactNode} from 'react';
import type {RowMenuItem} from '#ui/RowActionsMenu';
import type {CoreNodeMenuContext, CoreNodeMenuSlots, RowMenuContext} from './types';

/** Labels the first item with `group`; RowActionsMenu starts a group at every labelled item. */
export function startGroup(items: RowMenuItem[], group: ReactNode): RowMenuItem[] {
    if (items.length === 0) return items;
    return [{...items[0], group}, ...items.slice(1)];
}

/**
 * A node menu: "This node", an optional node-kind group, then "Remove". Read-only mode keeps only the non-mutating
 * items, which the caller puts in `middle`.
 */
export function coreNodeMenuItems(context: CoreNodeMenuContext, slots: CoreNodeMenuSlots = {}): RowMenuItem[] {
    const items: RowMenuItem[] = [];

    if (!context.readOnly) {
        const thisNode: RowMenuItem[] = [
            {id: 'rename-node', label: 'Rename node', icon: IconTag, onSelect: context.onRenameNode},
            {id: 'rename-field', label: 'Rename field', icon: IconPencil, onSelect: context.onRenameField},
            {id: 'duplicate', label: 'Duplicate', icon: IconCopy, onSelect: context.onDuplicate},
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

    items.push(...startGroup(slots.middle ?? [], slots.middleGroup));

    if (!context.readOnly) {
        items.push(
            ...startGroup(
                [
                    {
                        id: 'remove-from-flow',
                        label: 'Remove from flow',
                        icon: IconEyeOff,
                        onSelect: context.onRemoveFromFlow,
                    },
                    {id: 'delete', label: 'Delete', icon: IconTrash, danger: true, onSelect: context.onDelete},
                ],
                'Remove',
            ),
        );
    }
    return items;
}

/** The menu of one track row. It is never offered in read-only mode. */
export function rowMenuItems({
    noun,
    index,
    count,
    used,
    usedReason,
    onMove,
    onAddBelow,
    onDelete,
}: RowMenuContext): RowMenuItem[] {
    return [
        {id: 'move-up', label: 'Move up', icon: IconArrowUp, disabled: index === 0, onSelect: () => onMove('up')},
        {
            id: 'move-down',
            label: 'Move down',
            icon: IconArrowDown,
            disabled: index === count - 1,
            onSelect: () => onMove('down'),
        },
        {id: 'add-below', label: `Add ${noun} below`, icon: IconPlus, onSelect: onAddBelow},
        {
            id: `delete-${noun}`,
            label: `Delete ${noun}`,
            icon: IconTrash,
            danger: true,
            disabled: used,
            reason: used ? usedReason : undefined,
            onSelect: onDelete,
        },
    ];
}
