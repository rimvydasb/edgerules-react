export { TestsManager } from './TestsManager';
export type { TestsManagerProps } from './TestsManagerProps';
export type { DocumentationService } from './context/TestsManagerContext';
export { createTestRunner } from './runner/createTestRunner';
export type { GetFilter, MutableDecisionService, TestRunner, TestSubject, TestSubjectKind } from './tests-manager-types';
// Re-exported for compatibility — `qualifyPath` now lives in `test-cases-service`, which owns
// subject-relative paths (Resolved Decision #17).
export { qualifyPath } from '../test-cases-service';
export type { TestSubjectId } from '../test-cases-service';
