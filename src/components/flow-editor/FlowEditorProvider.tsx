import {createContext, useContext, useMemo, type ReactElement} from 'react';
import type {FlowEditorProviderProps} from './flow-editor-types';

type FlowEditorContextValue = Omit<FlowEditorProviderProps, 'children'>;

const FlowEditorContext = createContext<FlowEditorContextValue | null>(null);

/** Provides the node service, the documentation service and the host callbacks to every node of the canvas. */
export function FlowEditorProvider({children, ...value}: FlowEditorProviderProps): ReactElement {
    const {service, documentation, languageService, readOnly, onOpenNode} = value;
    const memo = useMemo(
        () => ({service, documentation, languageService, readOnly, onOpenNode}),
        [service, documentation, languageService, readOnly, onOpenNode],
    );
    return <FlowEditorContext.Provider value={memo}>{children}</FlowEditorContext.Provider>;
}

export function useFlowEditor(): FlowEditorContextValue {
    const context = useContext(FlowEditorContext);
    if (!context) throw new Error('FlowEditor components must be rendered inside a FlowEditorProvider');
    return context;
}
