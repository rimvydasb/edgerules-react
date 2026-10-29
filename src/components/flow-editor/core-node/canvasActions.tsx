import {createContext, useContext} from 'react';
import type {CanvasActions} from './types';

const CanvasActionsContext = createContext<CanvasActions | undefined>(undefined);

/** Provided by the FlowEditor canvas; a node rendered on its own has none. */
export const CanvasActionsProvider = CanvasActionsContext.Provider;

export function useCanvasActions(): CanvasActions | undefined {
    return useContext(CanvasActionsContext);
}
