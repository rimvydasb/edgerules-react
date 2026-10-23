import {useCallback, useState, type ReactElement} from 'react';
import type {CodeEditorService} from '../../code-editor';
import {FlowEditor, type FlowEditorOpenTarget, type FlowEditorService, type FlowLayout} from '../../flow-editor';
import {useProjectSession} from '../../project-session';

export interface FlowViewProps {
    root: string;
    service: FlowEditorService; // one per session and root path
    languageService: CodeEditorService;
    readOnly?: boolean;
    onOpenNode: (target: FlowEditorOpenTarget) => void;
}

/** The Flow Component nodes that are direct fields of the root path context, on the canvas of that root. */
export function FlowView({root, service, languageService, readOnly, onOpenNode}: FlowViewProps): ReactElement {
    const session = useProjectSession();
    // `FlowEditor` reads its layout on mount only; the Shell mounts a new view for another root.
    const [defaultLayout] = useState(() => session.flow.getLayout(root));
    const onLayoutChange = useCallback((layout: FlowLayout) => session.flow.setLayout(root, layout), [session, root]);
    return (
        <FlowEditor
            service={service}
            documentation={session.documentation}
            languageService={languageService}
            readOnly={readOnly}
            onOpenNode={onOpenNode}
            defaultLayout={defaultLayout}
            onLayoutChange={onLayoutChange}
        />
    );
}
