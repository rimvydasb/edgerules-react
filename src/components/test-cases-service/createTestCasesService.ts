import {createTestCasesCore} from './createTestCasesCore';
import {
    DEFAULT_DB_NAME,
    deleteTestResultRecord,
    getAllTestResults,
    getTestCasesRecord,
    openTestCasesDb,
    putTestCasesRecord,
    putTestResultRecord,
} from './indexedDbStore';
import type {
    TestCasesService,
    TestCasesServiceOptions,
    TestResultSet,
    TestSubjectId,
    TestSuite,
} from './test-cases-service-types';

// One subject's tests, persisted in a hidden IndexedDB store keyed by `modelName`. For standalone use; a
// project session keeps tests in its bundle instead (`ProjectTestsStore`).
export function createTestCasesService(
    modelName: string,
    subjectId: TestSubjectId,
    options: TestCasesServiceOptions = {},
): TestCasesService {
    const dbName = options.dbName ?? DEFAULT_DB_NAME;
    const onPersistError = options.onPersistError;

    let disposed = false;
    let db: IDBDatabase | undefined;
    let persistenceEnabled = typeof indexedDB !== 'undefined';

    function persistSuite({cases, rows}: TestSuite): void {
        if (!persistenceEnabled || !db) return;
        putTestCasesRecord(db, {modelName, subjectId, cases, rows}).catch((error: unknown) => {
            onPersistError?.(error, {op: 'putTestCases'});
        });
    }

    function persistResult(testCaseId: string, set: TestResultSet | undefined): void {
        if (!persistenceEnabled || !db) return;
        const write = set
            ? putTestResultRecord(db, {modelName, subjectId, testCaseId, set})
            : deleteTestResultRecord(db, modelName, subjectId, testCaseId);
        write.catch((error: unknown) => {
            onPersistError?.(error, {op: set ? 'saveResultSet' : 'clearResultSet', testCaseId});
        });
    }

    const core = createTestCasesCore({onSuiteChange: persistSuite, onResultChange: persistResult});

    // Local writes that happen before hydration resolves win over whatever IndexedDB eventually
    // returns for `cases`/`rows` — a synchronous caller should never see its own just-made edit
    // vanish underneath it. Results merge instead of being gated, since they are additive and keyed.
    async function hydrate(): Promise<void> {
        if (!persistenceEnabled) {
            queueMicrotask(() => {
                if (!disposed) core.notify();
            });
            return;
        }
        try {
            db = await openTestCasesDb(dbName);
        } catch (error) {
            persistenceEnabled = false;
            onPersistError?.(error, {op: 'hydrate'});
            core.notify();
            return;
        }
        if (disposed) {
            db.close();
            return;
        }
        try {
            const [record, resultRecords] = await Promise.all([
                getTestCasesRecord(db, modelName, subjectId),
                getAllTestResults(db, modelName, subjectId),
            ]);
            if (disposed) return;
            if (record && !core.hasLocalChanges()) core.replaceSuite(record);
            core.mergeResults(resultRecords.map((resultRecord) => resultRecord.set));
        } catch (error) {
            onPersistError?.(error, {op: 'hydrate'});
        } finally {
            if (!disposed) core.notify();
        }
    }
    void hydrate();

    return {
        ...core.service,

        dispose(): void {
            disposed = true;
            core.service.dispose();
            if (db) {
                db.close();
                db = undefined;
            }
        },
    };
}
