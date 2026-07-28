import {createContext, useContext, useEffect, type ReactElement, type ReactNode} from 'react';
import type {PortableRootContext} from '@edgerules/portable';
import type {CodeEditorService} from '../../code-editor';
import type {DocumentationService} from '../../documentation-service';
import type {TestCasesService, TestSubjectId} from '../../test-cases-service';
import type {TestRunner} from '../../tests-manager';
import type {BoxedEditorOpenTarget} from '../BoxedEditorProps';
import type {BoxedEditorService} from '../boxed-editor-types';

export interface BoxedEditorContextValue {
    service: BoxedEditorService;
    readOnly: boolean;
    showDescription: boolean;
    showTestResults: boolean;
    showType: boolean;
    languageService?: CodeEditorService;
    documentationService?: DocumentationService;
    testCasesService?: TestCasesService;
    testRunner?: TestRunner;
    testSubjectId?: TestSubjectId;
    autoRunTests: boolean;
    /** Host-controlled invalidation token; on change the provider calls `service.invalidate()`, and
     * `BoxedEditorTestContext` compares it against each result set's `modelRevision` for staleness. */
    revision?: string | number;
    /** Fired once per successful committed mutation, by `useRowCommands`. */
    onChange?: (snapshot: PortableRootContext) => void;
    /** Routes `View as code` (and any future host-editor handoff) to the host. */
    onOpenNode?: (target: BoxedEditorOpenTarget) => void;
}

const BoxedEditorContext = createContext<BoxedEditorContextValue | null>(null);

export type BoxedEditorProviderProps = BoxedEditorContextValue & {
    children: ReactNode;
};

/** Mounts the facade + column-visibility context every row and hook in this tree reads from. */
export function BoxedEditorProvider({children, ...value}: BoxedEditorProviderProps): ReactElement {
    const {service, revision} = value;

    useEffect(() => {
        service.invalidate();
        // Deliberately excludes `service` from deps beyond identity — a new revision on the same
        // service instance is the signal an external edit landed outside this editor.
    }, [service, revision]);

    return <BoxedEditorContext.Provider value={value}>{children}</BoxedEditorContext.Provider>;
}

export function useBoxedEditorContext(): BoxedEditorContextValue {
    const context = useContext(BoxedEditorContext);
    if (!context) {
        throw new Error('useBoxedEditorContext must be used within a BoxedEditor');
    }
    return context;
}
