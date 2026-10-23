import {useState} from 'react';
import {isPortableError} from '#lib/portable';
import {useFlowEditor} from '../FlowEditorProvider';
import {useNodeDescription} from './hooks';
import type {CoreNodeMenuContext, NodeEditing} from './types';

/** Runs a service command; returns the error text, which keeps an inline edit open. */
export function runCommand(command: () => unknown): string | void {
    const result = command();
    if (isPortableError(result)) return result.message;
}

/**
 * The state and actions every node kind shares: the provider context, the one inline edit, the description and the
 * callbacks of the "This node" and "Remove" menu groups.
 */
export function useCoreNode<Row extends {kind: string} = never>(field: string) {
    const {service, documentation, languageService, readOnly = false, onOpenNode} = useFlowEditor();
    const [editing, setEditing] = useState<NodeEditing<Row> | null>(null);
    const description = useNodeDescription(documentation, field);

    const menu: CoreNodeMenuContext = {
        hasDescription: Boolean(description),
        canDescribe: documentation !== undefined,
        readOnly,
        onRenameNode: () => setEditing({kind: 'node-name'}),
        onRenameField: () => setEditing({kind: 'field'}),
        onDuplicate: () => void runCommand(() => service.duplicate(field)),
        onAddDescription: () => setEditing({kind: 'description'}),
        onRemoveDescription: () => documentation?.setDescription(field, ''),
        onRemoveFromFlow: () => void runCommand(() => service.removeFromFlow(field)),
        onDelete: () => {
            const failed = runCommand(() => service.deleteField(field));
            if (!failed) documentation?.setDescription(field, '');
        },
    };

    return {service, documentation, languageService, readOnly, onOpenNode, editing, setEditing, menu};
}
