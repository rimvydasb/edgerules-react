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

// One stable composed result per result set and path, so `useSyncExternalStore` sees the same snapshot between
// notifications.
const composedResults = new WeakMap<TestResultSet['results'], Map<string, TestResult | undefined>>();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A row whose value is an object (a context, or a function or ruleset call such as `grade: riskGrade(score)`) has no
 * result of its own: the run keeps only the leaf paths beneath it (`grade.grade`, `grade.probabilityOfDefault`). This
 * puts them back together into one object. List elements (`bins[0].points`) are left out: the list row has its own
 * result.
 */
function composedResult(results: TestResultSet['results'], prefix: string): TestResult | undefined {
    let byPath = composedResults.get(results);
    if (!byPath) {
        byPath = new Map();
        composedResults.set(results, byPath);
    }
    if (byPath.has(prefix)) return byPath.get(prefix);

    const value: Record<string, unknown> = {};
    let found = false;
    for (const [path, item] of Object.entries(results)) {
        if (item.status !== 'ok') continue;
        if (prefix !== '' && !path.startsWith(`${prefix}.`)) continue;
        const segments = (prefix === '' ? path : path.slice(prefix.length + 1)).split('.');
        if (segments.some((segment) => segment.includes('['))) continue;
        const target = segments.slice(0, -1).reduce<Record<string, unknown> | undefined>((parent, segment) => {
            if (!parent) return undefined;
            const child = parent[segment] ?? (parent[segment] = {});
            return isPlainObject(child) ? child : undefined;
        }, value);
        if (!target) continue;
        target[segments[segments.length - 1]] = item.value;
        found = true;
    }
    const result: TestResult | undefined = found ? {path: prefix, status: 'ok', value} : undefined;
    byPath.set(prefix, result);
    return result;
}

/**
 * `path` is a `BoxedRowData`'s fully qualified, model-wide address; `TestResultSet.results` is
 * keyed subject-relative, so this un-qualifies it against `testSubjectId` (inverse of
 * `test-cases-service`'s `qualifyPath`) before reading the selected case's value for this row
 * (Section 5/6).
 *
 * The subject's own row shows the whole result only when `showSubjectResult` is set (a decision table opened on its
 * own, whose rows are rules); otherwise every part of it already shows in the row it belongs to.
 */
export function useRowTestResult(path: string, showSubjectResult = false): RowTestResultState {
    const {testCasesService, testSubjectId} = useBoxedEditorContext();
    const {currentCase, running, stale} = useBoxedEditorTestContext();
    const testCaseId = currentCase?.id;
    const relativePath = unqualifyPath(testSubjectId ?? '*', path);

    const getSnapshot = useCallback((): TestResult | undefined => {
        if (!testCasesService || testCaseId === undefined || relativePath === undefined) return undefined;
        const results = testCasesService.getResultSet(testCaseId)?.results;
        if (!results) return undefined;
        if (relativePath === '' && !showSubjectResult) return undefined;
        return results[relativePath] ?? composedResult(results, relativePath);
    }, [testCasesService, testCaseId, relativePath, showSubjectResult]);

    const result = useSyncExternalStore(testCasesService?.subscribe ?? subscribeNever, getSnapshot);

    return {
        result,
        pending: testCaseId !== undefined && running.includes(testCaseId),
        stale,
    };
}
