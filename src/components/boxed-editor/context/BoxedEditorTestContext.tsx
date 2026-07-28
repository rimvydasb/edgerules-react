import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactElement,
    type ReactNode,
} from 'react';
import type {TestCase} from '../../test-cases-service';
import {useBoxedEditorContext} from './BoxedEditorContext';

export interface BoxedEditorTestContextValue {
    cases: TestCase[];
    currentIndex: number;
    currentCase: TestCase | undefined;
    next: () => void;
    prev: () => void;
    /** Test case ids with a run in flight — drives per-cell and header pending state. */
    running: readonly string[];
    /** Whether the selected case's last result set predates the model's current `revision`. */
    stale: boolean;
    /** The selected case's run-level failure message, or undefined when it last ran cleanly. */
    runError: string | undefined;
    /** Debounced (300 ms), coalesced re-run of the selected case — called by `useRowCommands` after
     * every successful commit. No-ops wherever no `testRunner`/`autoRunTests` applies. */
    scheduleTestRun: () => void;
}

const EMPTY_CASES: TestCase[] = [];
const EMPTY_RUNNING: readonly string[] = [];
const noop = (): void => {};
const subscribeNever = (): (() => void) => () => {};

// Also the fallback for any tree that mounts hooks reading this context without a
// `BoxedEditorTestProvider` (e.g. a test harness wrapping only `BoxedEditorProvider`) — every field
// degrades to "no test cases" rather than throwing.
const DEFAULT_VALUE: BoxedEditorTestContextValue = {
    cases: EMPTY_CASES,
    currentIndex: 0,
    currentCase: undefined,
    next: noop,
    prev: noop,
    running: EMPTY_RUNNING,
    stale: false,
    runError: undefined,
    scheduleTestRun: noop,
};

const BoxedEditorTestContext = createContext<BoxedEditorTestContextValue>(DEFAULT_VALUE);

const AUTO_RUN_DEBOUNCE_MS = 300;

export interface BoxedEditorTestProviderProps {
    children: ReactNode;
}

/**
 * Hoists the selected-test-case state once for the whole editor (never per row) and drives every
 * live-test-result trigger from `docs/boxed-editor/phase-07-…md` Section 6: a debounced,
 * coalesced re-run after a commit, and a freshness-gated run on mount, `revision` change, and case
 * navigation. Safe to mount unconditionally — every trigger is a no-op when `testCasesService` /
 * `testRunner` is absent.
 */
export function BoxedEditorTestProvider({children}: BoxedEditorTestProviderProps): ReactElement {
    const {testCasesService, testRunner, autoRunTests, revision} = useBoxedEditorContext();
    const revisionText = revision === undefined ? undefined : String(revision);

    const cases = useSyncExternalStore(
        testCasesService?.subscribe ?? subscribeNever,
        useCallback(() => testCasesService?.listTestCases() ?? EMPTY_CASES, [testCasesService]),
    );
    const [rawIndex, setRawIndex] = useState(0);
    const currentIndex = cases.length === 0 ? 0 : Math.min(rawIndex, cases.length - 1);
    const currentCase = cases[currentIndex];

    const setCurrentIndex = useCallback(
        (index: number) => setRawIndex(Math.max(0, Math.min(index, Math.max(cases.length - 1, 0)))),
        [cases.length],
    );
    const next = useCallback(() => setCurrentIndex(currentIndex + 1), [currentIndex, setCurrentIndex]);
    const prev = useCallback(() => setCurrentIndex(currentIndex - 1), [currentIndex, setCurrentIndex]);

    const running = useSyncExternalStore(
        testRunner?.subscribe ?? subscribeNever,
        useCallback(() => testRunner?.getRunning() ?? EMPTY_RUNNING, [testRunner]),
    );

    const resultSet = useSyncExternalStore(
        testCasesService?.subscribe ?? subscribeNever,
        useCallback(
            () => (currentCase ? testCasesService?.getResultSet(currentCase.id) : undefined),
            [testCasesService, currentCase],
        ),
    );
    const stale = resultSet !== undefined && resultSet.modelRevision !== revisionText;
    const runError = resultSet?.status === 'error' ? resultSet.error : undefined;

    // `scheduleTestRun`'s debounce timer always fires against the *latest* runner/case, not whichever
    // was current when the timer was (re)armed.
    const testRunnerRef = useRef(testRunner);
    testRunnerRef.current = testRunner;
    const currentCaseRef = useRef(currentCase);
    currentCaseRef.current = currentCase;

    const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(debounceTimer.current), []);

    const scheduleTestRun = useCallback((): void => {
        if (!autoRunTests || !testRunnerRef.current) return;
        clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            const id = currentCaseRef.current?.id;
            if (id !== undefined) void testRunnerRef.current?.run(id);
        }, AUTO_RUN_DEBOUNCE_MS);
    }, [autoRunTests]);

    // Mount + case-selection change: an immediate freshness-gated run, never debounced — a discrete
    // navigation click should show `pending` right away rather than waiting out the commit debounce.
    useEffect(() => {
        if (!autoRunTests || !testRunner || !currentCase) return;
        const set = testCasesService?.getResultSet(currentCase.id);
        if (set !== undefined && set.modelRevision === revisionText) return;
        void testRunner.run(currentCase.id);
        // Deliberately keyed on the case id alone — `revisionText` is read fresh, not tracked, so an
        // external revision bump is handled by the effect below instead of double-firing this one.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentCase?.id]);

    // `revision` change: routed through the same debounce as a commit, so a host that bumps
    // `revision` from `onChange` (Section 6, "Commit ➜ re-run ➜ display") never double-runs — both
    // paths just coalesce onto the same timer.
    const mountedRef = useRef(false);
    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            return;
        }
        if (!autoRunTests || !testRunner || !currentCase) return;
        const set = testCasesService?.getResultSet(currentCase.id);
        if (set !== undefined && set.modelRevision === revisionText) return;
        scheduleTestRun();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revisionText]);

    const value = useMemo<BoxedEditorTestContextValue>(
        () => ({cases, currentIndex, currentCase, next, prev, running, stale, runError, scheduleTestRun}),
        [cases, currentIndex, currentCase, next, prev, running, stale, runError, scheduleTestRun],
    );

    return <BoxedEditorTestContext.Provider value={value}>{children}</BoxedEditorTestContext.Provider>;
}

export function useBoxedEditorTestContext(): BoxedEditorTestContextValue {
    return useContext(BoxedEditorTestContext);
}
