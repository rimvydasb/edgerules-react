export type Unsubscribe = () => void;

// '*' for the whole model, otherwise the callable's dotted path (e.g. 'library.eligibility').
export type TestSubjectId = string;

export type TestSectionId = 'inputs' | 'assertions' | 'validations';

// One grid row: which path it addresses and where it sits. Rows are subject-wide — every test case shares them.
export interface TestRow {
  path: string; // Subject-relative; '' for a scalar-returning callable's single result row.
  section: TestSectionId;
  order: number; // Position within its section.
  type?: string; // Declared/inferred type name, used to parse cells and as the Path cell tooltip.
  present: boolean; // False once the model no longer declares this path — hidden in the GUI, kept in IndexedDB.
}

// Raw cell text exactly as typed, keyed by subject-relative path. Parsed per the row's type at run time.
export type TestValuesByPath = Record<string, string>;

// One grid column: everything the user authored for it. A test case owns its values and nothing else —
// results are produced by running it and live separately.
export interface TestCase {
  id: string; // Stable identifier; survives renames.
  name: string; // Column header, e.g. "Standard application".
  order: number;
  inputs: TestValuesByPath; // Values bound before execution; only `inputs`-section paths.
  assertions: TestValuesByPath; // Expected values; only `assertions`-section paths.
}

export type TestResultStatus = 'ok' | 'error' | 'missing' | 'pending';

// One path's computed outcome. Carries no run metadata — that belongs to the run, not to each value.
export interface TestResult {
  path: string; // Subject-relative, matching TestRow.path.
  value?: unknown; // Exactly what the engine returned for this path. Omitted when status is 'error'.
  error?: string; // Message when this path failed to evaluate.
  status: TestResultStatus;
}

// The outcome of running one test case once: run-level metadata plus one TestResult per path.
// Running the case again replaces the whole set — there is never more than one per test case.
export interface TestResultSet {
  testCaseId: string;
  ranAt: number; // Epoch ms of the run.
  modelRevision?: string; // The `revision` in force during the run; drives staleness.
  status: 'ok' | 'error'; // 'error' when the run itself failed and no path was evaluated.
  error?: string; // Run-level failure: a PortableError from `execute`, or a missing solver.
  results: Record<string, TestResult>; // Keyed by subject-relative path.
}

export type TestCellKind = 'input' | 'assertion'; // Which of a TestCase's two value maps a cell belongs to.

export interface TestCasesServiceOptions {
  // IndexedDB database name. Defaults to 'edgerules-test-cases'.
  dbName?: string;

  // Called when a background IndexedDB operation fails. In-memory state is unaffected. Omit to ignore silently.
  onPersistError?: (error: unknown, context: { op: string; path?: string; testCaseId?: string }) => void;
}

export interface TestCasesService {
  // --- test cases (grid columns) ---
  listTestCases(): TestCase[]; // Ordered by TestCase.order; each carries its own inputs/assertions.
  getTestCase(testCaseId: string): TestCase | undefined;

  addTestCase(name?: string): TestCase; // Appends with empty value maps; defaults the name to "Test Case N".
  renameTestCase(testCaseId: string, name: string): void;

  removeTestCase(testCaseId: string): void; // Also drops that case's values and its result set.
  moveTestCase(testCaseId: string, toIndex: number): void;

  // --- rows (shared by every column) ---
  listRows(): TestRow[]; // Ordered by section, then TestRow.order.
  syncRows(rows: TestRow[]): void; // Reconciles derived rows with persisted ones (see Tests Pre-Generation).
  moveRow(path: string, toIndex: number): void; // Within the row's own section.
  setRowSection(path: string, section: TestSectionId): void; // Promote/demote between assertions and validations.

  // --- cells: accessors into one test case's inputs/assertions map ---
  getCell(testCaseId: string, path: string, kind: TestCellKind): string | undefined; // Raw text as typed.
  setCell(testCaseId: string, path: string, kind: TestCellKind, text: string): void; // Empty string removes the entry.

  // --- results ---
  getResultSet(testCaseId: string): TestResultSet | undefined; // Undefined until the case has been run.
  saveResultSet(set: TestResultSet): void; // Replaces the case's previous set outright.
  clearResultSet(testCaseId: string): void;

  // Migrate rows, cell keys, and result keys when a node's path changes (called after a successful rename/move).
  renamePath(from: string, to: string): void;

  // Notified after any in-memory change, and once after initial IndexedDB hydration completes.
  subscribe(listener: () => void): Unsubscribe;

  // Closes the IndexedDB connection and drops listeners; an in-flight hydration result is discarded on arrival.
  dispose(): void;
}
