import {IconCopy, IconNote, IconNoteOff, IconTag, IconTrash} from '@tabler/icons-react';
import type {RowMenuItem} from '#ui/RowActionsMenu';
import {startGroup} from '../core-node';
import type {OutputNodeMenuContext} from './types';

/**
 * The OutputNode menu: "This node", then "Remove". The node is canvas data only, so it has no field to rename and
 * Delete takes it off the canvas. Read-only mode offers nothing: every item changes the canvas.
 */
export function outputNodeMenuItems(context: OutputNodeMenuContext): RowMenuItem[] {
    if (context.readOnly) return [];
    const thisNode: RowMenuItem[] = [
        {id: 'rename-node', label: 'Rename node', icon: IconTag, onSelect: context.onRenameNode},
    ];
    if (context.onDuplicate) {
        thisNode.push({id: 'duplicate', label: 'Duplicate', icon: IconCopy, onSelect: context.onDuplicate});
    }
    thisNode.push(
        context.hasDescription
            ? {
                  id: 'remove-description',
                  label: 'Remove description',
                  icon: IconNoteOff,
                  onSelect: context.onRemoveDescription,
              }
            : {id: 'add-description', label: 'Add description', icon: IconNote, onSelect: context.onAddDescription},
    );
    return [
        ...startGroup(thisNode, 'This node'),
        ...startGroup(
            [{id: 'delete', label: 'Delete', icon: IconTrash, danger: true, onSelect: context.onDelete}],
            'Remove',
        ),
    ];
}
