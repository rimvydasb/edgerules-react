import {IconCode, IconCopy, IconExternalLink, IconNote, IconNoteOff, IconPencil, IconTrash} from '@tabler/icons-react';
import type {RowMenuItem} from '#ui/RowActionsMenu';
import {startGroup} from '../core-node';
import type {ExpressionNodeMenuContext} from './types';

/**
 * The ExpressionNode menu: "This node", "Expression" with the host routes, then "Remove". An expression is always on
 * the flow, so it has no Remove from flow; it has no node name, so it has no Rename node. Read-only mode keeps the
 * host routes.
 */
export function expressionNodeMenuItems(context: ExpressionNodeMenuContext): RowMenuItem[] {
    const {field, readOnly, onOpenNode} = context;
    const items: RowMenuItem[] = [];
    if (!readOnly) {
        const thisNode: RowMenuItem[] = [
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
                'Expression',
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
