import {useMemo, type ReactElement} from 'react';
import {BoxedEditor, type BoxedEditorOpenTarget, type BoxedEditorService} from '../../boxed-editor';
import type {CodeEditorService} from '../../code-editor';
import {useProjectSession, useProjectSlice} from '../../project-session';

export interface BoxedViewProps {
    root: string;
    service: BoxedEditorService; // one per session
    languageService: CodeEditorService;
    readOnly?: boolean;
    onOpenNode: (target: BoxedEditorOpenTarget) => void;
}

/** The boxed expression rows of the root path; a function path shows its body. */
export function BoxedView({root, service, languageService, readOnly, onOpenNode}: BoxedViewProps): ReactElement {
    const session = useProjectSession();
    const {version} = useProjectSlice('model');
    const testCases = useMemo(() => session.tests.forSubject('*'), [session]);
    return (
        <BoxedEditor
            service={service}
            path={root}
            revision={version}
            readOnly={readOnly}
            onOpenNode={onOpenNode}
            languageService={languageService}
            documentationService={session.documentation}
            testCasesService={testCases}
        />
    );
}
