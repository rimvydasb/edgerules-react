import type {ReactElement} from 'react';
import {TestsManager} from '../../tests-manager';
import {useProjectSession, useProjectSlice} from '../../project-session';

export interface TestsViewProps {
    subjectId: string; // '*' or the path of a function or a ruleset
    readOnly?: boolean;
    onSubjectChange: (subjectId: string) => void;
}

/** The tests of one subject, kept in the tests store of the session. */
export function TestsView({subjectId, readOnly, onSubjectChange}: TestsViewProps): ReactElement {
    const session = useProjectSession();
    const {version} = useProjectSlice('model');
    return (
        <TestsManager
            service={session.engine}
            testCases={session.tests}
            documentationService={session.documentation}
            subjectId={subjectId}
            onSubjectChange={onSubjectChange}
            revision={version}
            readOnly={readOnly}
        />
    );
}
