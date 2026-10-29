import {IconCode, IconExternalLink} from '@tabler/icons-react';
import type {RowMenuItem} from '#ui/RowActionsMenu';
import {coreNodeMenuItems} from '../core-node';
import type {ListInputNodeMenuContext} from './types';

/** The ListInputNode menu: the core groups plus the "List" group with the host routes. */
export function listInputNodeMenuItems(context: ListInputNodeMenuContext): RowMenuItem[] {
    const {onOpenNode, field} = context;

    const listItems: RowMenuItem[] = onOpenNode
        ? [
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
          ]
        : [];

    return coreNodeMenuItems(context, {middle: listItems, middleGroup: 'List'});
}
