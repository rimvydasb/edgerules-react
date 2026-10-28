import 'fake-indexeddb/auto';
import {render, screen, waitFor} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {openFixtureProject} from '../../project-session/testing/sessionFixture';
import {TestsManager} from '../TestsManager';

const PROJECT_TESTS = {
    schemaVersion: 1 as const,
    subjects: {
        risk: {
            cases: [{id: 'young', name: 'Young applicant', order: 0, inputs: {age: '20'}, assertions: {}}],
            rows: [{path: 'age', section: 'inputs' as const, order: 0, type: 'number', present: true}],
        },
    },
};

describe('TestsManager — project session tests', () => {
    it('shows the session-owned suite of the subject without IndexedDB hydration', async () => {
        const {session} = await openFixtureProject({tests: PROJECT_TESTS});
        render(
            <TestsManager
                service={session.engine}
                testCases={session.tests}
                documentationService={session.documentation}
                subjectId="risk"
            />,
        );

        await waitFor(() => expect(screen.getByTestId('row-age')).toBeInTheDocument());
        expect(screen.getAllByText('Young applicant').length).toBeGreaterThan(0);
        expect(screen.queryByText('Test Case 1')).not.toBeInTheDocument();
    });

    it('marks no assertion of a case that has not run', async () => {
        const {session} = await openFixtureProject({
            tests: {
                schemaVersion: 1,
                subjects: {
                    risk: {
                        cases: [
                            {id: 'young', name: 'Young', order: 0, inputs: {age: '20'}, assertions: {level: 'low'}},
                        ],
                        rows: [
                            {path: 'age', section: 'inputs', order: 0, type: 'number', present: true},
                            {path: 'level', section: 'assertions', order: 0, type: 'string', present: true},
                        ],
                    },
                },
            },
        });
        render(<TestsManager service={session.engine} testCases={session.tests} subjectId="risk" />);

        const assertion = await screen.findByLabelText('assertion level');
        expect(assertion).toHaveAttribute('data-mismatch', 'false');
        expect(screen.getByTestId('assertion-summary-young')).toHaveTextContent('');
    });

    it('pre-generates into the session, which marks the tests slice dirty', async () => {
        const {session} = await openFixtureProject();
        const {unmount} = render(<TestsManager service={session.engine} testCases={session.tests} />);

        await waitFor(() => expect(screen.getByTestId('row-applicant.age')).toBeInTheDocument());
        expect(session.getSnapshot().dirtySlices).toEqual(['tests']);
        expect(session.getSlice('tests').subjects['*'].cases.map((c) => c.name)).toEqual(['Test Case 1']);

        // Unmounting leaves the session's tests in place.
        unmount();
        expect(session.tests.forSubject('*').listTestCases()).toHaveLength(1);
    });
});
