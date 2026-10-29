import {useMemo, type ReactElement} from 'react';
import {listCallables} from '#lib/callables';
import {BoxedEditor, type BoxedEditorOpenTarget, type BoxedEditorService} from '../../boxed-editor';
import type {CodeEditorService} from '../../code-editor';
import {useProjectSession, useProjectSlice} from '../../project-session';
import {createTestRunner, type TestSubject} from '../../tests-manager';

export interface BoxedViewProps {
    root: string;
    service: BoxedEditorService; // one per session
    languageService: CodeEditorService;
    readOnly?: boolean;
    onOpenNode: (target: BoxedEditorOpenTarget) => void;
}

/**
 * The boxed expression rows of the root path; a function path shows its header row with its arguments, then its body.
 * The test column shows the tests of the root path when it is a test subject: the model ('*') or a fully typed
 * function or decision table. Any other root path (a context, a type, a field or a generic function) has no test
 * column.
 */
export function BoxedView({root, service, languageService, readOnly, onOpenNode}: BoxedViewProps): ReactElement {
    const session = useProjectSession();
    const {version} = useProjectSlice('model');
    const subject = useMemo<TestSubject | undefined>(() => {
        if (root === '*') return {id: '*', kind: 'model', name: '*'};
        const callable = listCallables(session.engine).find((candidate) => candidate.path === root);
        return callable && {id: callable.path, kind: callable.kind, name: callable.path};
        // `version` re-reads the callables after a model change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, root, version]);
    const testCases = useMemo(
        () => (subject ? session.tests.forSubject(subject.id) : undefined),
        [session, subject?.id],
    );
    const testRunner = useMemo(
        () =>
            subject && testCases
                ? createTestRunner(session.engine, testCases, subject, {modelRevision: String(version)})
                : undefined,
        [session, testCases, subject, version],
    );
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
            testRunner={testRunner}
            testSubjectId={subject?.id}
        />
    );
}
