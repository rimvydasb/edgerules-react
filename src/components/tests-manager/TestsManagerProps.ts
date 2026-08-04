import type { SxProps, Theme } from '@mui/material/styles';
import type { TestResultSet } from '../test-cases-service';
import type { DocumentationService } from './context/TestsManagerContext';
import type { MutableDecisionService, TestSubjectId } from './tests-manager-types';

export interface TestsManagerProps {
  // The model authority. TestRunner executes against it; TestsManager never mutates it.
  service: MutableDecisionService;
  // IndexedDB namespace for this model's test data and descriptions.
  modelName: string;
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
  // Whether committing an input re-runs its case automatically. Defaults to true.
  autoRun?: boolean;
  // Fired after each completed run, successful or failed.
  onRunComplete?: (set: TestResultSet) => void;
  className?: string;
  sx?: SxProps<Theme>;
}
