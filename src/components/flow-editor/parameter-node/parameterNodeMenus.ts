import {IconExternalLink, IconForms, IconNote, IconNoteOff, IconTag, IconTrash} from '@tabler/icons-react';
import type {RowMenuItem} from '#ui/RowActionsMenu';
import {startGroup} from '../core-node';
import type {ParameterNodeMenuContext} from './types';

/**
 * The ParameterNode menu: "This parameter", "Type" with the host route to a named record type, then "Remove". A
 * parameter is always on the flow of its service, so it has no Remove from flow. Read-only mode keeps the host route.
 */
export function parameterNodeMenuItems(context: ParameterNodeMenuContext): RowMenuItem[] {
    const {model, readOnly, onOpenNode} = context;
    const items: RowMenuItem[] = [];
    if (!readOnly) {
        const thisParameter: RowMenuItem[] = [
            {id: 'rename-parameter', label: 'Rename parameter', icon: IconTag, onSelect: context.onRename},
            {id: 'change-type', label: 'Change type', icon: IconForms, onSelect: context.onChangeType},
        ];
        if (context.canDescribe) {
            thisParameter.push(
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
        items.push(...startGroup(thisParameter, 'This parameter'));
    }
    if (onOpenNode && model.typePath) {
        const typePath = model.typePath;
        items.push(
            ...startGroup(
                [
                    {
                        id: 'open-type',
                        label: `Open ${typePath} in boxed editor`,
                        icon: IconExternalLink,
                        onSelect: () => onOpenNode({path: typePath, kind: 'boxed-editor'}),
                    },
                ],
                'Type',
            ),
        );
    }
    if (!readOnly) {
        const service = model.field.slice(0, -(model.name.length + 1));
        items.push(
            ...startGroup(
                [
                    {
                        id: 'delete',
                        label: 'Delete parameter',
                        icon: IconTrash,
                        danger: true,
                        disabled: model.used,
                        reason: model.used ? `Read by ${service}` : undefined,
                        onSelect: context.onDelete,
                    },
                ],
                'Remove',
            ),
        );
    }
    return items;
}
