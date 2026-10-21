import {createChangeBatch, type ListenerSet} from '../../lib/changeBatch';
import type {
    TestCase,
    TestCasesService,
    TestCellKind,
    TestResult,
    TestResultSet,
    TestRow,
    TestSectionId,
    TestSuite,
    TestValuesByPath,
} from './test-cases-service-types';

const SECTION_ORDER: readonly TestSectionId[] = ['inputs', 'assertions', 'validations'];

function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `tc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneValues(values: TestValuesByPath): TestValuesByPath {
    return {...values};
}

function cloneCase(testCase: TestCase): TestCase {
    return {...testCase, inputs: cloneValues(testCase.inputs), assertions: cloneValues(testCase.assertions)};
}

function cloneRow(row: TestRow): TestRow {
    return {...row};
}

function cloneResultSet(set: TestResultSet): TestResultSet {
    const results: Record<string, TestResult> = {};
    for (const [path, result] of Object.entries(set.results)) {
        results[path] = {...result};
    }
    return {...set, results};
}

function compareRows(a: TestRow, b: TestRow): number {
    const sectionDiff = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
    if (sectionDiff !== 0) return sectionDiff;
    return a.order - b.order;
}

// True when `path` is `from` itself, or a nested field beneath it (`from.` prefix).
function matchesPath(path: string, from: string): boolean {
    return path === from || path.startsWith(`${from}.`);
}

function rewritePath(path: string, from: string, to: string): string {
    if (path === from) return to;
    return to + path.slice(from.length);
}

function rewriteValueKeys(
    values: TestValuesByPath,
    from: string,
    to: string,
): {values: TestValuesByPath; changed: boolean} {
    let changed = false;
    const next: TestValuesByPath = {};
    for (const [path, text] of Object.entries(values)) {
        if (matchesPath(path, from)) {
            changed = true;
            next[rewritePath(path, from, to)] = text;
        } else {
            next[path] = text;
        }
    }
    return {values: next, changed};
}

function clampIndex(index: number, length: number): number {
    return Math.max(0, Math.min(index, length));
}

export function cloneSuite(suite: TestSuite): TestSuite {
    return {cases: suite.cases.map(cloneCase), rows: suite.rows.map(cloneRow)};
}

export interface TestCasesCoreOptions {
    // Where subscribers are kept; a batched set defers notifications to the end of a project transaction.
    listeners?: ListenerSet;
    // After every change to cases or rows. `suite` is the live state: read it, do not keep or mutate it.
    onSuiteChange?: (suite: TestSuite) => void;
    // After a case's result set is saved, rewritten, or dropped (`undefined`).
    onResultChange?: (testCaseId: string, set: TestResultSet | undefined) => void;
}

/**
 * The in-memory state of one subject's tests behind the `TestCasesService` API, with no persistence of its own.
 * `createTestCasesService` adds IndexedDB through the hooks; `ProjectTestsStore` keeps it in a project bundle.
 */
export interface TestCasesCore {
    service: TestCasesService; // `dispose` drops the listeners
    exportSuite(): TestSuite; // a deep copy
    // Replaces cases and rows without calling `onSuiteChange`; keeps the results of cases that still exist.
    // Like `mergeResults`, it does not notify: call `notify()` once the state is complete.
    replaceSuite(suite: TestSuite): void;
    // Adds result sets for cases that have none yet, without calling `onResultChange`.
    mergeResults(sets: TestResultSet[]): void;
    // True once a caller has changed cases or rows through `service`.
    hasLocalChanges(): boolean;
    notify(): void;
}

export function createTestCasesCore(options: TestCasesCoreOptions = {}): TestCasesCore {
    const listeners = options.listeners ?? createChangeBatch().createListenerSet();
    const {onSuiteChange, onResultChange} = options;

    let localCasesOrRowsMutated = false;
    let cases: TestCase[] = [];
    let rows: TestRow[] = [];
    const results = new Map<string, TestResultSet>();

    // `useSyncExternalStore` requires `getSnapshot` to return a referentially stable value when
    // nothing changed, but every read method below clones its data. `version` — bumped once per
    // `notify()` — gates a per-method cache so repeated reads between mutations return the same
    // reference instead of a fresh clone each call.
    let version = 0;
    let casesCacheVersion = -1;
    let casesCache: TestCase[] = [];
    let rowsCacheVersion = -1;
    let rowsCache: TestRow[] = [];
    let resultsCacheVersion = -1;
    let resultsCache = new Map<string, TestResultSet | undefined>();

    function notify(): void {
        version += 1;
        listeners.notify();
    }

    function suiteChanged(): void {
        localCasesOrRowsMutated = true;
        onSuiteChange?.({cases, rows});
        notify();
    }

    function resultChanged(testCaseId: string, set: TestResultSet | undefined): void {
        onResultChange?.(testCaseId, set);
    }

    // Moves every trace of `from` (and anything nested beneath it) to `to`: rows, both value maps of
    // every case, and every stored result. Shared by `renamePath` (the model renamed a field) and
    // `setRowPath` (the user retyped a row's path); neither persists or notifies from here.
    function rewriteEverywhere(from: string, to: string): boolean {
        let changed = false;

        const nextRows = rows.map((row) => {
            if (matchesPath(row.path, from)) {
                changed = true;
                return {...row, path: rewritePath(row.path, from, to)};
            }
            return row;
        });

        const nextCases = cases.map((testCase) => {
            const inputs = rewriteValueKeys(testCase.inputs, from, to);
            const assertions = rewriteValueKeys(testCase.assertions, from, to);
            if (inputs.changed || assertions.changed) {
                changed = true;
                return {...testCase, inputs: inputs.values, assertions: assertions.values};
            }
            return testCase;
        });

        for (const [testCaseId, set] of results) {
            let setChanged = false;
            const nextResults: Record<string, TestResult> = {};
            for (const [path, result] of Object.entries(set.results)) {
                if (matchesPath(path, from)) {
                    setChanged = true;
                    const newPath = rewritePath(path, from, to);
                    nextResults[newPath] = {...result, path: newPath};
                } else {
                    nextResults[path] = result;
                }
            }
            if (setChanged) {
                changed = true;
                const nextSet = {...set, results: nextResults};
                results.set(testCaseId, nextSet);
                resultChanged(testCaseId, nextSet);
            }
        }

        if (!changed) return false;
        rows = nextRows;
        cases = nextCases;
        return true;
    }

    const service: TestCasesService = {
        listTestCases(): TestCase[] {
            if (casesCacheVersion !== version) {
                casesCache = [...cases].sort((a, b) => a.order - b.order).map(cloneCase);
                casesCacheVersion = version;
            }
            return casesCache;
        },

        getTestCase(testCaseId: string): TestCase | undefined {
            const found = cases.find((c) => c.id === testCaseId);
            return found ? cloneCase(found) : undefined;
        },

        addTestCase(name?: string): TestCase {
            const order = cases.length === 0 ? 0 : Math.max(...cases.map((c) => c.order)) + 1;
            // Inherits the previous (highest-order) case's input values, so filling in a second or third
            // case is a tweak rather than a retype; assertions always start blank — a promoted row is
            // shared, but what each case expects of it is not.
            const previous = cases.reduce<TestCase | undefined>(
                (latest, c) => (!latest || c.order > latest.order ? c : latest),
                undefined,
            );
            const testCase: TestCase = {
                id: generateId(),
                name: name ?? `Test Case ${cases.length + 1}`,
                order,
                inputs: previous ? cloneValues(previous.inputs) : {},
                assertions: {},
            };
            cases.push(testCase);
            suiteChanged();
            return cloneCase(testCase);
        },

        renameTestCase(testCaseId: string, name: string): void {
            const testCase = cases.find((c) => c.id === testCaseId);
            if (!testCase) return;
            testCase.name = name;
            suiteChanged();
        },

        removeTestCase(testCaseId: string): void {
            const index = cases.findIndex((c) => c.id === testCaseId);
            if (index === -1) return;
            cases.splice(index, 1);
            cases.forEach((c, i) => {
                c.order = i;
            });
            results.delete(testCaseId);
            resultChanged(testCaseId, undefined);
            suiteChanged();
        },

        moveTestCase(testCaseId: string, toIndex: number): void {
            const ordered = [...cases].sort((a, b) => a.order - b.order);
            const fromIndex = ordered.findIndex((c) => c.id === testCaseId);
            if (fromIndex === -1) return;
            const [item] = ordered.splice(fromIndex, 1);
            ordered.splice(clampIndex(toIndex, ordered.length), 0, item);
            ordered.forEach((c, i) => {
                c.order = i;
            });
            // Keep the backing array itself in this order too — `removeTestCase` reindexes by array
            // position, which must agree with the `.order` field it just wrote.
            cases = ordered;
            suiteChanged();
        },

        listRows(): TestRow[] {
            if (rowsCacheVersion !== version) {
                rowsCache = [...rows].sort(compareRows).map(cloneRow);
                rowsCacheVersion = version;
            }
            return rowsCache;
        },

        syncRows(derivedRows: TestRow[]): void {
            const existingByPath = new Map(rows.map((r) => [r.path, r]));
            const derivedPaths = new Set(derivedRows.map((r) => r.path));
            const sectionMaxOrder: Record<TestSectionId, number> = {inputs: -1, assertions: -1, validations: -1};
            for (const existing of rows) {
                if (existing.order > sectionMaxOrder[existing.section]) {
                    sectionMaxOrder[existing.section] = existing.order;
                }
            }

            const nextRows: TestRow[] = [];
            for (const derived of derivedRows) {
                const existing = existingByPath.get(derived.path);
                if (existing) {
                    nextRows.push({...existing, type: derived.type, present: true});
                } else {
                    sectionMaxOrder[derived.section] += 1;
                    nextRows.push({...derived, order: sectionMaxOrder[derived.section], present: true});
                }
            }
            for (const existing of rows) {
                if (!derivedPaths.has(existing.path)) {
                    // A user-authored row is never derived from the schema, so its absence from `derivedRows`
                    // says nothing about whether it still addresses anything — only a derived row's
                    // disappearance means the model dropped it. (The Path cell flags an unknown path instead.)
                    nextRows.push({...existing, present: existing.custom === true});
                }
            }

            rows = nextRows;
            suiteChanged();
        },

        moveRow(path: string, toIndex: number): void {
            const row = rows.find((r) => r.path === path);
            if (!row) return;
            const sectionRows = rows.filter((r) => r.section === row.section).sort((a, b) => a.order - b.order);
            const fromIndex = sectionRows.findIndex((r) => r.path === path);
            const [item] = sectionRows.splice(fromIndex, 1);
            sectionRows.splice(clampIndex(toIndex, sectionRows.length), 0, item);
            sectionRows.forEach((r, i) => {
                r.order = i;
            });
            suiteChanged();
        },

        duplicateRow(fromPath: string, toPath: string): void {
            const source = rows.find((r) => r.path === fromPath);
            if (!source || fromPath === toPath) return;
            if (rows.some((r) => r.path === toPath)) return;

            const copy: TestRow = {...source, path: toPath, custom: true, present: true};
            // Ordered right after its source, with the rest of the section pushed down, so a duplicate
            // never lands at the bottom of the section away from the row it came from.
            const sectionRows = rows.filter((r) => r.section === source.section).sort((a, b) => a.order - b.order);
            sectionRows.splice(sectionRows.findIndex((r) => r.path === fromPath) + 1, 0, copy);
            sectionRows.forEach((r, i) => {
                r.order = i;
            });
            rows.push(copy);

            for (const testCase of cases) {
                const input = testCase.inputs[fromPath];
                if (input !== undefined) testCase.inputs[toPath] = input;
                const assertion = testCase.assertions[fromPath];
                if (assertion !== undefined) testCase.assertions[toPath] = assertion;
            }

            suiteChanged();
        },

        setRowPath(from: string, to: string): boolean {
            const row = rows.find((r) => r.path === from);
            if (!row || from === to || to === '') return false;
            // The rewrite carries anything nested under `from` along with it, so the check is against
            // every path it would produce, not just `to` itself — two rows must never share a path.
            const moving = rows.filter((r) => matchesPath(r.path, from));
            const produced = new Set(moving.map((r) => rewritePath(r.path, from, to)));
            if (rows.some((r) => !matchesPath(r.path, from) && produced.has(r.path))) return false;
            rewriteEverywhere(from, to);
            const moved = rows.find((r) => r.path === to);
            if (moved) moved.custom = true;
            suiteChanged();
            return true;
        },

        removeRow(path: string): void {
            const index = rows.findIndex((r) => r.path === path);
            if (index === -1) return;
            const [removed] = rows.splice(index, 1);
            rows.filter((r) => r.section === removed.section)
                .sort((a, b) => a.order - b.order)
                .forEach((r, i) => {
                    r.order = i;
                });
            for (const testCase of cases) {
                delete testCase.inputs[path];
                delete testCase.assertions[path];
            }
            for (const [testCaseId, set] of results) {
                if (!Object.prototype.hasOwnProperty.call(set.results, path)) continue;
                const nextResults = {...set.results};
                delete nextResults[path];
                const nextSet = {...set, results: nextResults};
                results.set(testCaseId, nextSet);
                resultChanged(testCaseId, nextSet);
            }
            suiteChanged();
        },

        setRowSection(path: string, section: TestSectionId): void {
            const row = rows.find((r) => r.path === path);
            if (!row || row.section === section) return;
            const previousSection = row.section;
            const maxOrder = rows.filter((r) => r.section === section).reduce((max, r) => Math.max(max, r.order), -1);
            row.section = section;
            row.order = maxOrder + 1;
            if (previousSection === 'assertions' && section !== 'assertions') {
                for (const testCase of cases) {
                    delete testCase.assertions[path];
                }
            }
            suiteChanged();
        },

        getCell(testCaseId: string, path: string, kind: TestCellKind): string | undefined {
            const testCase = cases.find((c) => c.id === testCaseId);
            if (!testCase) return undefined;
            return (kind === 'input' ? testCase.inputs : testCase.assertions)[path];
        },

        setCell(testCaseId: string, path: string, kind: TestCellKind, text: string): void {
            const testCase = cases.find((c) => c.id === testCaseId);
            if (!testCase) return;
            const map = kind === 'input' ? testCase.inputs : testCase.assertions;
            if (text === '') {
                delete map[path];
            } else {
                map[path] = text;
            }
            suiteChanged();
        },

        getResultSet(testCaseId: string): TestResultSet | undefined {
            if (resultsCacheVersion !== version) {
                resultsCache = new Map();
                resultsCacheVersion = version;
            }
            if (!resultsCache.has(testCaseId)) {
                const set = results.get(testCaseId);
                resultsCache.set(testCaseId, set ? cloneResultSet(set) : undefined);
            }
            return resultsCache.get(testCaseId);
        },

        saveResultSet(set: TestResultSet): void {
            results.set(set.testCaseId, set);
            resultChanged(set.testCaseId, set);
            notify();
        },

        clearResultSet(testCaseId: string): void {
            if (!results.has(testCaseId)) return;
            results.delete(testCaseId);
            resultChanged(testCaseId, undefined);
            notify();
        },

        renamePath(from: string, to: string): void {
            if (!rewriteEverywhere(from, to)) return;
            suiteChanged();
        },

        subscribe: listeners.subscribe,

        dispose(): void {
            listeners.clear();
        },
    };

    return {
        service,

        exportSuite: () => cloneSuite({cases, rows}),

        replaceSuite(suite: TestSuite): void {
            ({cases, rows} = cloneSuite(suite));
            const caseIds = new Set(cases.map((c) => c.id));
            for (const testCaseId of [...results.keys()]) {
                if (!caseIds.has(testCaseId)) results.delete(testCaseId);
            }
        },

        mergeResults(sets: TestResultSet[]): void {
            for (const set of sets) {
                if (!results.has(set.testCaseId)) results.set(set.testCaseId, set);
            }
        },

        hasLocalChanges: () => localCasesOrRowsMutated,

        notify,
    };
}
