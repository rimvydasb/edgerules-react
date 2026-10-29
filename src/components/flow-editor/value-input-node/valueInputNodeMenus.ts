import {IconCode, IconExternalLink} from '@tabler/icons-react';
import type {RowMenuItem} from '#ui/RowActionsMenu';
import {coreNodeMenuItems} from '../core-node';
import type {ValueInputNodeMenuContext} from './types';

/** The ValueInputNode menu: the core groups plus the "Value" group with the host routes. */
export function valueInputNodeMenuItems(context: ValueInputNodeMenuContext): RowMenuItem[] {
    const {onOpenNode, field} = context;

    const valueItems: RowMenuItem[] = onOpenNode
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

    return coreNodeMenuItems(context, {middle: valueItems, middleGroup: 'Value'});
}
