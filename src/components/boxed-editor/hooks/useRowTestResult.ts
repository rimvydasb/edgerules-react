import {useCallback, useSyncExternalStore} from 'react';
import type {TestResult, TestResultSet} from '../../test-cases-service';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {useBoxedEditorTestContext} from '../context/BoxedEditorTestContext';
import {unqualifyPath} from '#lib/portableUtils';

export interface RowTestResultState {
    result: TestResult | undefined;
    /** A run for the selected case is in flight. */
    pending: boolean;
    /** The selected case's result set predates the model's current revision. */
    stale: boolean;
}

const subscribeNever = (): (() => void) => () => {};

// One stable whole-subject result per result set, so `useSyncExternalStore` sees the same snapshot between notifications.
const subjectResults = new WeakMap<TestResultSet['results'], TestResult>();

/** The subject's own row (a decision table or function opened on its own) shows every result path of the run. */
function subjectResult(results: TestResultSet['results']): TestResult | undefined {
    if (results[''] !== undefined) return results[''];
    const entries = Object.entries(results);
    if (entries.length === 0) return undefined;
    let result = subjectResults.get(results);
    if (!result) {
        result = {path: '', status: 'ok', value: Object.fromEntries(entries.map(([path, item]) => [path, item.value]))};
        subjectResults.set(results, result);
    }
    return result;
}

/**
 * `path` is a `BoxedRowData`'s fully qualified, model-wide address; `TestResultSet.results` is
 * keyed subject-relative, so this un-qualifies it against `testSubjectId` (inverse of
 * `test-cases-service`'s `qualifyPath`) before reading the selected case's value for this row
 * (Section 5/6).
 */
export function useRowTestResult(path: string): RowTestResultState {
    const {testCasesService, testSubjectId} = useBoxedEditorContext();
    const {currentCase, running, stale} = useBoxedEditorTestContext();
    const testCaseId = currentCase?.id;
    const relativePath = unqualifyPath(testSubjectId ?? '*', path);

    const getSnapshot = useCallback((): TestResult | undefined => {
        if (!testCasesService || testCaseId === undefined || relativePath === undefined) return undefined;
        const results = testCasesService.getResultSet(testCaseId)?.results;
        if (!results) return undefined;
        return relativePath === '' ? subjectResult(results) : results[relativePath];
    }, [testCasesService, testCaseId, relativePath]);

    const result = useSyncExternalStore(testCasesService?.subscribe ?? subscribeNever, getSnapshot);

    return {
        result,
        pending: testCaseId !== undefined && running.includes(testCaseId),
        stale,
    };
}
