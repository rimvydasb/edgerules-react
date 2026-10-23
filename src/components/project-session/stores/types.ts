import type {Unsubscribe} from '../../../lib/changeBatch';
import type {DocumentationService} from '../../documentation-service';
import type {FlowLayout} from '../../../lib/flowLayout';
import type {TestCasesService, TestSubjectId} from '../../test-cases-service';
import type {DocumentationDocument, FlowMetadataDocument, TestSuitesDocument} from '../bundle/types';

/**
 * One authored slice of a project, held in memory by its `ProjectSession`. The session moves every slice in and out
 * of a bundle together; stores never persist on their own.
 */
export interface SliceStore<TDocument> {
    // An immutable snapshot that keeps its identity until the slice changes. Do not mutate it.
    exportDocument(): TDocument;
    // Replaces the whole slice, for example when the session loads or rolls back.
    replaceDocument(document: TDocument): void;
    // Moves everything stored under `from` (the path itself and anything nested in it) to `to`.
    renamePath(from: string, to: string): void;
    subscribe(listener: () => void): Unsubscribe;
}

// Descriptions by model path. Also a `DocumentationService`, so it plugs into every editor as is; its `dispose`
// belongs to the session.
export interface DocumentationStore extends DocumentationService, SliceStore<DocumentationDocument> {}

// Every subject's tests. Hands out one `TestCasesService` per subject; a component calling its `dispose` changes
// nothing, since the session owns the data. Results stay in memory and are never exported.
export interface ProjectTestsStore extends SliceStore<TestSuitesDocument> {
    forSubject(subjectId: TestSubjectId): TestCasesService;
}

// Flow canvas presentation data: positions, output nodes and chart nodes.
export interface FlowMetadataStore extends SliceStore<FlowMetadataDocument> {
    getLayout(): FlowLayout; // same reference until the layout changes
    setLayout(layout: FlowLayout): void; // fits `FlowEditor`'s `onLayoutChange`; an equal layout is no change
}
