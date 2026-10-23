import {createTestCasesCore, type TestCasesCore} from '../../test-cases-service/internal';
import type {TestCasesService, TestSubjectId, TestSuite} from '../../test-cases-service';
import type {TestSuitesDocument} from '../bundle/types';
import {isAtOrUnder, movePath, sameJson, type StoreContext} from './storeSupport';
import type {ProjectTestsStore} from './types';

interface Subject {
    core: TestCasesCore;
    facade: TestCasesService;
    saved: TestSuite; // the suite after its last real change; immutable
}

function isEmpty(suite: TestSuite): boolean {
    return suite.cases.length === 0 && suite.rows.length === 0;
}

// Subject-relative form of a model path, or undefined when the path is not inside `subjectId`.
function relativePath(subjectId: TestSubjectId, path: string): string | undefined {
    if (subjectId === '*') return path;
    return path.startsWith(`${subjectId}.`) ? path.slice(subjectId.length + 1) : undefined;
}

export function createProjectTestsStore(context: StoreContext): ProjectTestsStore {
    const listeners = context.listeners();
    const subjects = new Map<TestSubjectId, Subject>();
    let snapshot: TestSuitesDocument | undefined;

    function changed(): void {
        snapshot = undefined;
        context.onChange();
        listeners.notify();
    }

    function subject(subjectId: TestSubjectId): Subject {
        let entry = subjects.get(subjectId);
        if (!entry) {
            const core = createTestCasesCore({
                listeners: context.listeners(),
                // `syncRows` reports a change on every call; only a real difference is a project edit.
                onSuiteChange: (suite) => {
                    if (sameJson(suite, created.saved)) return;
                    created.saved = core.exportSuite();
                    changed();
                },
            });
            const created: Subject = {
                core,
                facade: {...core.service, dispose: () => {}},
                saved: {cases: [], rows: []},
            };
            subjects.set(subjectId, created);
            entry = created;
        }
        return entry;
    }

    function moveSubjects(from: string, to: string): boolean {
        const moving = [...subjects.keys()].filter((subjectId) => subjectId !== '*' && isAtOrUnder(subjectId, from));
        const entries = moving.map((subjectId) => [subjectId, subjects.get(subjectId)!] as const);
        for (const [subjectId] of entries) subjects.delete(subjectId);
        for (const [subjectId, entry] of entries) subjects.set(movePath(subjectId, from, to), entry);
        return entries.some(([, entry]) => !isEmpty(entry.saved));
    }

    return {
        forSubject: (subjectId) => subject(subjectId).facade,

        renamePath(from, to) {
            if (from === to) return;
            // A callable's suite moves with it; paths inside it are relative to it and stay as they are.
            const movedSuites = moveSubjects(from, to);
            for (const [subjectId, entry] of subjects) {
                const relativeFrom = relativePath(subjectId, from);
                const relativeTo = relativePath(subjectId, to);
                if (relativeFrom !== undefined && relativeTo !== undefined) {
                    entry.core.service.renamePath(relativeFrom, relativeTo);
                }
            }
            if (movedSuites) changed();
        },

        exportDocument() {
            if (!snapshot) {
                const exported: TestSuitesDocument['subjects'] = {};
                for (const [subjectId, entry] of [...subjects].sort(([a], [b]) => a.localeCompare(b))) {
                    if (!isEmpty(entry.saved)) exported[subjectId] = entry.saved;
                }
                snapshot = {schemaVersion: 1, subjects: exported};
            }
            return snapshot;
        },

        replaceDocument(document) {
            for (const subjectId of new Set([...subjects.keys(), ...Object.keys(document.subjects)])) {
                const entry = subject(subjectId);
                const suite = document.subjects[subjectId] ?? {cases: [], rows: []};
                entry.core.replaceSuite(suite);
                entry.saved = entry.core.exportSuite();
                entry.core.notify();
            }
            changed();
        },

        subscribe: listeners.subscribe,
    };
}
