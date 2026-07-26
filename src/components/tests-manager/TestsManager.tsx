import Box from '@mui/material/Box';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createTestCasesService } from '../test-cases-service';
import { TestsManagerProvider } from './context/TestsManagerContext';
import { TestsManagerUiProvider } from './context/TestsManagerUiContext';
import { TestsGrid } from './grid/TestsGrid';
import { deriveRows, detectRenames } from './model/rows';
import { listTestSubjects } from './model/subjects';
import { createTestRunner } from './runner/createTestRunner';
import type { TestsManagerProps } from './TestsManagerProps';
import type { TestSubjectId } from './tests-manager-types';

// Root: subject state, pre-generation, providers, header + sections.
export function TestsManager(props: TestsManagerProps): ReactElement {
  const {
    service,
    modelName,
    documentationService,
    subjectId: controlledSubjectId,
    onSubjectChange,
    revision,
    readOnly = false,
    pageSize = 10,
    autoRun = true,
    onRunComplete,
    className,
    sx,
  } = props;

  const [uncontrolledSubjectId, setUncontrolledSubjectId] =
    useState<TestSubjectId>('*');
  const subjectId = controlledSubjectId ?? uncontrolledSubjectId;

  const subjects = useMemo(
    () => listTestSubjects(service),
    [service, revision],
  );
  const subject =
    subjects.find((candidate) => candidate.id === subjectId) ?? subjects[0];

  const testCasesService = useMemo(
    () => createTestCasesService(modelName, subject.id),
    [modelName, subject.id],
  );
  useEffect(() => () => testCasesService.dispose(), [testCasesService]);

  const runner = useMemo(
    () =>
      createTestRunner(service, testCasesService, subject, {
        modelRevision: revision !== undefined ? String(revision) : undefined,
      }),
    [service, testCasesService, subject, revision],
  );

  // `TestCasesService` is synchronous-over-cache with async IndexedDB hydration in the background
  // (see test-cases-service's Persistence section). Pre-generation must not run before that
  // hydration completes — `syncRows`/`addTestCase` called too early would mark the service
  // "locally mutated" and cause it to discard the very persisted data hydration was about to
  // deliver. Subscribing in a layout effect (synchronous with mount, before any queued microtask
  // from the no-IndexedDB fallback's hydration can fire) guarantees the one-time hydration
  // notification is never missed.
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    setReady(false);
    return testCasesService.subscribe(() => setReady(true));
  }, [testCasesService]);

  useEffect(() => {
    if (!ready) return;
    const derived = deriveRows(service, subject);
    for (const rename of detectRenames(testCasesService.listRows(), derived)) {
      testCasesService.renamePath(rename.from, rename.to);
    }
    testCasesService.syncRows(derived);
    if (testCasesService.listTestCases().length === 0) {
      testCasesService.addTestCase();
    }
  }, [ready, service, subject, testCasesService, revision]);

  // Re-runs every case on a genuine `revision` change (not on the initial mount) when `autoRun` is
  // on — see Stale results / Execution triggers.
  const previousRevisionRef = useRef(revision);
  useEffect(() => {
    if (!ready) return;
    if (previousRevisionRef.current === revision) return;
    previousRevisionRef.current = revision;
    if (autoRun) void runner.runAll();
  }, [ready, revision, autoRun, runner]);

  useEffect(() => {
    if (!onRunComplete) return undefined;
    const lastRanAt = new Map<string, number>();
    for (const testCase of testCasesService.listTestCases()) {
      const set = testCasesService.getResultSet(testCase.id);
      if (set) lastRanAt.set(testCase.id, set.ranAt);
    }
    return testCasesService.subscribe(() => {
      for (const testCase of testCasesService.listTestCases()) {
        const set = testCasesService.getResultSet(testCase.id);
        if (set && lastRanAt.get(testCase.id) !== set.ranAt) {
          lastRanAt.set(testCase.id, set.ranAt);
          onRunComplete(set);
        }
      }
    });
  }, [testCasesService, onRunComplete]);

  const handleSubjectChange = (id: TestSubjectId): void => {
    if (controlledSubjectId === undefined) setUncontrolledSubjectId(id);
    onSubjectChange?.(id);
  };

  return (
    <Box className={className} sx={sx} data-testid="tests-manager">
      <TestsManagerProvider
        value={{
          service,
          testCasesService,
          runner,
          documentationService,
          subject,
          readOnly,
          revision,
          pageSize,
          autoRun,
        }}
      >
        <TestsManagerUiProvider>
          <TestsGrid onSubjectChange={handleSubjectChange} />
        </TestsManagerUiProvider>
      </TestsManagerProvider>
    </Box>
  );
}
