import {createContext, useContext, useSyncExternalStore, type ReactElement, type ReactNode} from 'react';
import type {ProjectSession, ProjectSessionSnapshot, ProjectSlice, ProjectSliceSnapshots} from '../session/types';

const ProjectSessionContext = createContext<ProjectSession | undefined>(undefined);

export interface ProjectProviderProps {
    session: ProjectSession; // pass another session to switch the subtree to another project
    children: ReactNode;
}

// Hands one session to a workspace subtree. The context value is the session itself, never its changing state.
export function ProjectProvider({session, children}: ProjectProviderProps): ReactElement {
    return <ProjectSessionContext.Provider value={session}>{children}</ProjectSessionContext.Provider>;
}

export function useProjectSession(): ProjectSession {
    const session = useContext(ProjectSessionContext);
    if (!session) throw new Error('useProjectSession must be used within a ProjectProvider');
    return session;
}

// Phase, revision, dirty slices and DSL validity; rerenders when any of them changes.
export function useProjectSnapshot(): ProjectSessionSnapshot {
    const session = useProjectSession();
    return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

// One slice's immutable snapshot; rerenders only when that slice changes.
export function useProjectSlice<K extends ProjectSlice>(slice: K): ProjectSliceSnapshots[K] {
    const session = useProjectSession();
    return useSyncExternalStore(session.subscribe, () => session.getSlice(slice));
}
