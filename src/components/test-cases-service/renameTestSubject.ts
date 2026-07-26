import type { TestCasesServiceOptions, TestSubjectId } from './test-cases-service-types';
import {
  DEFAULT_DB_NAME,
  deleteTestCasesRecord,
  deleteTestResultRecord,
  getAllTestCasesRecordsForModel,
  getAllTestResultRecordsForModel,
  openTestCasesDb,
  putTestCasesRecord,
  putTestResultRecord,
} from './indexedDbStore';

// True when `subjectId` is `from` itself, or nested beneath it (`from.` prefix) — the set of subjects
// carried along when a context containing callables is renamed or moved.
function matchesPrefix(subjectId: string, from: string): boolean {
  return subjectId === from || subjectId.startsWith(`${from}.`);
}

function rewritePrefix(subjectId: string, from: string, to: string): string {
  if (subjectId === from) return to;
  return to + subjectId.slice(from.length);
}

// Rewrites stored test data when a callable — or a context containing callables — is renamed or moved.
// Standalone rather than an instance method: one rename can affect many subjects at once and typically
// none of them has a live TestCasesService instance. Rewrites every subject id equal to `from` or
// prefixed `from.`, across both object stores.
export async function renameTestSubject(
  modelName: string,
  from: TestSubjectId,
  to: TestSubjectId,
  options?: Pick<TestCasesServiceOptions, 'dbName' | 'onPersistError'>,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const dbName = options?.dbName ?? DEFAULT_DB_NAME;
  let db: IDBDatabase;
  try {
    db = await openTestCasesDb(dbName);
  } catch (error) {
    options?.onPersistError?.(error, { op: 'renameTestSubject' });
    return;
  }

  try {
    const caseRecords = await getAllTestCasesRecordsForModel(db, modelName);
    for (const record of caseRecords) {
      if (!matchesPrefix(record.subjectId, from)) continue;
      const newSubjectId = rewritePrefix(record.subjectId, from, to);
      await deleteTestCasesRecord(db, modelName, record.subjectId);
      await putTestCasesRecord(db, { ...record, subjectId: newSubjectId });
    }

    const resultRecords = await getAllTestResultRecordsForModel(db, modelName);
    for (const record of resultRecords) {
      if (!matchesPrefix(record.subjectId, from)) continue;
      const newSubjectId = rewritePrefix(record.subjectId, from, to);
      await deleteTestResultRecord(db, modelName, record.subjectId, record.testCaseId);
      await putTestResultRecord(db, { ...record, subjectId: newSubjectId });
    }
  } catch (error) {
    options?.onPersistError?.(error, { op: 'renameTestSubject' });
  } finally {
    db.close();
  }
}
