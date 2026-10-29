import type {CSSProperties} from 'react';
import type {TestCasesService, TestResultSet} from '../test-cases-service';
import type {DocumentationService} from './context/TestsManagerContext';
import type {MutableDecisionService, TestSubjectId} from './tests-manager-types';

// Hands out one subject's tests — a project session's `tests` store fits.
export interface TestCasesSource {
    forSubject(subjectId: TestSubjectId): TestCasesService;
}

// Where the tests live: a hidden IndexedDB store keyed by `modelName`, or a host-owned source.
export type TestsManagerStorage =
    | {
          // IndexedDB namespace for this model's test data.
          modelName: string;
          testCases?: never;
      }
    | {
          // Host-owned tests, already loaded; TestsManager neither hydrates nor disposes them.
          testCases: TestCasesSource;
          modelName?: never;
      };

export type TestsManagerProps = TestsManagerStorage & TestsManagerBaseProps;

export interface TestsManagerBaseProps {
    // The model authority. TestRunner executes against it; TestsManager never mutates it.
    service: MutableDecisionService;
    // Supplies the Description column; the column is read-only without it.
    documentationService?: DocumentationService;
    // Controlled subject selection. Uncontrolled and defaulting to '*' when omitted.
    subjectId?: TestSubjectId;
    // Fired when the Path column header drop-down changes.
    onSubjectChange?: (subjectId: TestSubjectId) => void;
    // Host-controlled invalidation token. Change it after model edits made elsewhere.
    revision?: string | number;
    // Disables cell editing, reordering, and case CRUD; running stays available.
    readOnly?: boolean;
    // Test-case columns per page. Defaults to 10.
    pageSize?: number;
    // Whether cases run automatically: on opening a subject and on a `revision` change, each case without a fresh
    // result set; on committing an input, its case. Defaults to true.
    autoRun?: boolean;
    // Fired after each completed run, successful or failed.
    onRunComplete?: (set: TestResultSet) => void;
    className?: string;
    style?: CSSProperties;
}
