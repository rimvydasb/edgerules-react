import {IconArrowsExchange, IconCode, IconExternalLink, IconFlask, IconPlus} from '@tabler/icons-react';
import type {ReactNode} from 'react';
import type {RowMenuItem} from '#ui/RowActionsMenu';
import {coreNodeMenuItems, rowMenuItems} from '../core-node';
import type {ArgumentMenuContext, FunctionNodeMenuContext, FunctionNodeModel} from './types';

function callers(count: number): string {
    return `${count} ${count === 1 ? 'caller' : 'callers'}`;
}

/** The node menu of the Menus table: the core groups plus Change callee… and the callee group. */
export function functionNodeMenuItems(context: FunctionNodeMenuContext): RowMenuItem[] {
    const {model, readOnly, onOpenNode} = context;
    const {callee} = model;

    const calleeItems: RowMenuItem[] = [];
    if (callee && !readOnly) {
        calleeItems.push({id: 'add-argument', label: 'Add argument', icon: IconPlus, onSelect: context.onAddArgument});
    }
    if (callee && onOpenNode) {
        calleeItems.push(
            callee.kind === 'ruleset'
                ? {
                      id: 'open-editor',
                      label: 'Open in decision table editor',
                      icon: IconExternalLink,
                      onSelect: () => onOpenNode({path: callee.path, kind: 'ruleset'}),
                  }
                : {
                      id: 'open-editor',
                      label: 'Open in boxed editor',
                      icon: IconExternalLink,
                      onSelect: () => onOpenNode({path: callee.path, kind: 'boxed-editor'}),
                  },
            {
                id: 'open-tests',
                label: 'Open tests',
                icon: IconFlask,
                onSelect: () => onOpenNode({path: callee.path, kind: 'tests'}),
            },
            {
                id: 'view-code',
                label: 'View as code',
                icon: IconCode,
                onSelect: () => onOpenNode({path: model.field, kind: 'code-editor'}),
            },
        );
    }

    return coreNodeMenuItems(context, {
        afterRename: [
            {id: 'change-callee', label: 'Change callee…', icon: IconArrowsExchange, onSelect: context.onChangeCallee},
        ],
        middle: calleeItems,
        middleGroup: callee && (
            <>
                Callee <code>{callee.path}</code> · {callers(model.callers)}
            </>
        ),
    });
}

/** The argument menu of the Menus table. It is never offered in read-only mode. */
export function argumentMenuItems({model, argument, onMove, onAddBelow, onDelete}: ArgumentMenuContext): RowMenuItem[] {
    return rowMenuItems({
        noun: 'argument',
        index: model.arguments.findIndex((candidate) => candidate.name === argument.name),
        count: model.arguments.length,
        used: argument.used,
        usedReason: `Used in ${model.callee?.path ?? ''}`,
        onMove,
        onAddBelow,
        onDelete,
    });
}

export function argumentMenuFooter(model: FunctionNodeModel): ReactNode {
    return (
        <>
            Changes <code>{model.callee?.path}</code> for {callers(model.callers)}
        </>
    );
}
