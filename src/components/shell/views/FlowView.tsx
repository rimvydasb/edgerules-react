import {useCallback, useMemo, useState, type ReactElement} from 'react';
import {BoxedEditor, type BoxedEditorOpenTarget, type BoxedEditorService} from '../../boxed-editor';
import type {CodeEditorService} from '../../code-editor';
import {
    FlowEditor,
    type FlowEditorOpenTarget,
    type FlowEditorService,
    type FlowFocusRequest,
    type FlowLayout,
    type FlowSelection,
} from '../../flow-editor';
import {SinkSheet} from '../../flow-editor/internal';
import {useProjectSession, useProjectSlice} from '../../project-session';
import * as classes from '../shell.module.css';

export interface FlowViewProps {
    root: string;
    service: FlowEditorService; // one per session and root path
    boxedService: BoxedEditorService; // one per session; shows the selected model node in the split screen
    languageService: CodeEditorService;
    readOnly?: boolean;
    onOpenNode: (target: FlowEditorOpenTarget | BoxedEditorOpenTarget) => void;
    focusNode?: FlowFocusRequest; // the node a Project Explorer click centers
    split?: boolean; // shows the selected node right of the canvas
}

/**
 * The Flow Component nodes that are direct fields of the root path context, on the canvas of that root. With the split
 * screen on, the selected node shows on the right in a Boxed Editor: a function node as the body of its callee, an
 * input node at its field path. An Output or a Chart node shows the full data wired into it. A click on the empty
 * canvas clears the selection and closes the panel.
 */
export function FlowView({
    root,
    service,
    boxedService,
    languageService,
    readOnly,
    onOpenNode,
    focusNode,
    split,
}: FlowViewProps): ReactElement {
    const session = useProjectSession();
    const {version} = useProjectSlice('model');
    // `FlowEditor` reads its layout on mount only; the Shell mounts a new view for another root.
    const [defaultLayout] = useState(() => session.flow.getLayout(root));
    const onLayoutChange = useCallback((layout: FlowLayout) => session.flow.setLayout(root, layout), [session, root]);
    const [selection, setSelection] = useState<FlowSelection | undefined>();
    // A function node shows the body of the function or ruleset it calls; a draft without a callee, its own field.
    const boxedPath = useMemo(() => {
        if (!selection || !('field' in selection)) return undefined;
        if (selection.kind !== 'function') return selection.field;
        return service.getFunctionNode(selection.field).callee?.path ?? selection.field;
        // `version` re-reads the callee after a model change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [service, selection, version]);
    // The canvas keeps its place in the tree when the split screen opens or closes, so it is never mounted again.
    return (
        <div className={classes.split}>
            <div className={classes.splitCanvas}>
                <FlowEditor
                    service={service}
                    documentation={session.documentation}
                    languageService={languageService}
                    readOnly={readOnly}
                    onOpenNode={onOpenNode}
                    defaultLayout={defaultLayout}
                    onLayoutChange={onLayoutChange}
                    focusNode={focusNode}
                    defaultPaletteCollapsed
                    onSelectionChange={setSelection}
                />
            </div>
            {split && selection && (
                <div className={classes.splitPanel} data-testid="shell-split-panel">
                    {boxedPath !== undefined ? (
                        <BoxedEditor
                            key={boxedPath}
                            service={boxedService}
                            path={boxedPath}
                            revision={version}
                            readOnly={readOnly}
                            onOpenNode={onOpenNode}
                            languageService={languageService}
                            documentationService={session.documentation}
                        />
                    ) : (
                        'id' in selection && <SinkSheet key={selection.id} service={service} sink={selection} />
                    )}
                </div>
            )}
        </div>
    );
}
