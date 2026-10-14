import {
    IconArrowDown,
    IconArrowUp,
    IconArrowsExchange,
    IconCode,
    IconCopy,
    IconExternalLink,
    IconEyeOff,
    IconFlask,
    IconNote,
    IconNoteOff,
    IconPencil,
    IconPlus,
    IconTag,
    IconTrash,
} from '@tabler/icons-react';
import type {ReactNode} from 'react';
import type {RowMenuItem} from '../../../ui/RowActionsMenu';
import type {
    FlowEditorOpenTarget,
    FunctionNodeModel,
    InputField,
    InputNodeModel,
    NodeArgument,
} from '../flow-editor-types';

function callers(count: number): string {
    return `${count} ${count === 1 ? 'caller' : 'callers'}`;
}

export interface NodeMenuContext {
    model: FunctionNodeModel;
    hasDescription: boolean;
    canDescribe: boolean; // a documentation service is present
    readOnly: boolean;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
    onRenameNode: () => void;
    onRenameField: () => void;
    onChangeCallee: () => void;
    onDuplicate: () => void;
    onAddDescription: () => void;
    onRemoveDescription: () => void;
    onAddArgument: () => void;
    onRemoveFromFlow: () => void;
    onDelete: () => void;
}

/** The node menu of the Menus table. Read-only mode keeps the non-mutating items. */
export function nodeMenuItems(context: NodeMenuContext): RowMenuItem[] {
    const {model, readOnly, onOpenNode} = context;
    const {callee} = model;
    const items: RowMenuItem[] = [];
    const first = (group: ReactNode) => ({group});

    if (!readOnly) {
        items.push(
            {
                id: 'rename-node',
                label: 'Rename node',
                icon: IconTag,
                onSelect: context.onRenameNode,
                ...first('This node'),
            },
            {id: 'rename-field', label: 'Rename field', icon: IconPencil, onSelect: context.onRenameField},
            {id: 'change-callee', label: 'Change callee…', icon: IconArrowsExchange, onSelect: context.onChangeCallee},
            {id: 'duplicate', label: 'Duplicate', icon: IconCopy, onSelect: context.onDuplicate},
        );
        if (context.canDescribe) {
            items.push(
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
    }

    if (callee) {
        const group = (
            <>
                Callee <code>{callee.path}</code> · {callers(model.callers)}
            </>
        );
        const calleeItems: RowMenuItem[] = [];
        if (!readOnly) {
            calleeItems.push({
                id: 'add-argument',
                label: 'Add argument',
                icon: IconPlus,
                onSelect: context.onAddArgument,
            });
        }
        if (onOpenNode) {
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
        if (calleeItems.length > 0) items.push({...calleeItems[0], group}, ...calleeItems.slice(1));
    }

    if (!readOnly) {
        items.push(
            {
                id: 'remove-from-flow',
                label: 'Remove from flow',
                icon: IconEyeOff,
                onSelect: context.onRemoveFromFlow,
                group: 'Remove',
            },
            {id: 'delete', label: 'Delete', icon: IconTrash, danger: true, onSelect: context.onDelete},
        );
    }
    return items;
}

export interface ArgumentMenuContext {
    model: FunctionNodeModel;
    argument: NodeArgument;
    onMove: (direction: 'up' | 'down') => void;
    onAddBelow: () => void;
    onDelete: () => void;
}

/** The argument menu of the Menus table. It is never offered in read-only mode. */
export function argumentMenuItems({model, argument, onMove, onAddBelow, onDelete}: ArgumentMenuContext): RowMenuItem[] {
    const index = model.arguments.findIndex((candidate) => candidate.name === argument.name);
    const calleePath = model.callee?.path ?? '';
    return [
        {id: 'move-up', label: 'Move up', icon: IconArrowUp, disabled: index === 0, onSelect: () => onMove('up')},
        {
            id: 'move-down',
            label: 'Move down',
            icon: IconArrowDown,
            disabled: index === model.arguments.length - 1,
            onSelect: () => onMove('down'),
        },
        {id: 'add-below', label: 'Add argument below', icon: IconPlus, onSelect: onAddBelow},
        {
            id: 'delete-argument',
            label: 'Delete argument',
            icon: IconTrash,
            danger: true,
            disabled: argument.used,
            reason: argument.used ? `Used in ${calleePath}` : undefined,
            onSelect: onDelete,
        },
    ];
}

export function argumentMenuFooter(model: FunctionNodeModel): ReactNode {
    return (
        <>
            Changes <code>{model.callee?.path}</code> for {callers(model.callers)}
        </>
    );
}

export interface InputNodeMenuContext {
    field: string;
    hasDescription: boolean;
    canDescribe: boolean; // a documentation service is present
    readOnly: boolean;
    onOpenNode?: (target: FlowEditorOpenTarget) => void;
    onRenameNode: () => void;
    onRenameField: () => void;
    onDuplicate: () => void;
    onAddDescription: () => void;
    onRemoveDescription: () => void;
    onAddField: () => void;
    onRemoveFromFlow: () => void;
    onDelete: () => void;
}

/** The InputNode menu: the "This node" and "Remove" groups of the node menu, plus the host routes. */
export function inputNodeMenuItems(context: InputNodeMenuContext): RowMenuItem[] {
    const {readOnly, onOpenNode, field} = context;
    const items: RowMenuItem[] = [];

    if (!readOnly) {
        items.push(
            {
                id: 'rename-node',
                label: 'Rename node',
                icon: IconTag,
                onSelect: context.onRenameNode,
                group: 'This node',
            },
            {id: 'rename-field', label: 'Rename field', icon: IconPencil, onSelect: context.onRenameField},
            {id: 'duplicate', label: 'Duplicate', icon: IconCopy, onSelect: context.onDuplicate},
        );
        if (context.canDescribe) {
            items.push(
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
    }

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
    if (recordItems.length > 0) items.push({...recordItems[0], group: 'Record'}, ...recordItems.slice(1));

    if (!readOnly) {
        items.push(
            {
                id: 'remove-from-flow',
                label: 'Remove from flow',
                icon: IconEyeOff,
                onSelect: context.onRemoveFromFlow,
                group: 'Remove',
            },
            {id: 'delete', label: 'Delete', icon: IconTrash, danger: true, onSelect: context.onDelete},
        );
    }
    return items;
}

export interface InputFieldMenuContext {
    model: InputNodeModel;
    item: InputField;
    onMove: (direction: 'up' | 'down') => void;
    onAddBelow: () => void;
    onDelete: () => void;
}

/** The field menu of an InputNode: the argument menu of the FunctionNode, for a record field. */
export function inputFieldMenuItems({model, item, onMove, onAddBelow, onDelete}: InputFieldMenuContext): RowMenuItem[] {
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
        {id: 'add-below', label: 'Add field below', icon: IconPlus, onSelect: onAddBelow},
        {
            id: 'delete-field',
            label: 'Delete field',
            icon: IconTrash,
            danger: true,
            disabled: item.used,
            reason: item.used ? `Read as ${model.field}.${item.name}` : undefined,
            onSelect: onDelete,
        },
    ];
}

export function inputFieldMenuFooter(model: InputNodeModel): ReactNode {
    return (
        <>
            Changes <code>{model.field}</code>
        </>
    );
}
