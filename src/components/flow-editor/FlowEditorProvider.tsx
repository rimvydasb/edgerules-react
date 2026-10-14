import {createContext, useContext, useEffect, useMemo, useState, type ReactElement} from 'react';
import type {FlowEditorProviderProps, FlowEditorService, FunctionNodeModel, InputNodeModel} from './flow-editor-types';

type FlowEditorContextValue = Omit<FlowEditorProviderProps, 'children'>;

const FlowEditorContext = createContext<FlowEditorContextValue | null>(null);

/** Provides the node service, the documentation service and the host callbacks to every node of the canvas. */
export function FlowEditorProvider({children, ...value}: FlowEditorProviderProps): ReactElement {
    const {service, documentation, readOnly, onOpenNode} = value;
    const memo = useMemo(
        () => ({service, documentation, readOnly, onOpenNode}),
        [service, documentation, readOnly, onOpenNode],
    );
    return <FlowEditorContext.Provider value={memo}>{children}</FlowEditorContext.Provider>;
}

export function useFlowEditor(): FlowEditorContextValue {
    const context = useContext(FlowEditorContext);
    if (!context) throw new Error('FlowEditor components must be rendered inside a FlowEditorProvider');
    return context;
}

// Reads again after every committed change of the service.
function useServiceRead<T>(service: FlowEditorService, field: string, read: () => T): T {
    const [version, setVersion] = useState(0);
    useEffect(() => service.subscribe(() => setVersion((current) => current + 1)), [service]);
    // `version` is the cache key: the service builds a new model object on every read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(read, [service, field, version]);
}

/** The node model of one field; reads again after every committed change of the service. */
export function useFunctionNodeModel(service: FlowEditorService, field: string): FunctionNodeModel {
    return useServiceRead(service, field, () => service.getFunctionNode(field));
}

/** The input node model of one field; reads again after every committed change of the service. */
export function useInputNodeModel(service: FlowEditorService, field: string): InputNodeModel {
    return useServiceRead(service, field, () => service.getInputNode(field));
}
