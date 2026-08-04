import type { PortableError, PortableNode, PortableRootContext } from '@edgerules/portable';
import type { TestResultSet, TestSubjectId, Unsubscribe } from '../test-cases-service';

export type GetFilter = 'FIELDS' | 'TYPE_DEFINITIONS' | 'FUNCTION_DEFINITIONS' | 'EXTERNAL_DEFINITIONS' | 'ALL';

/**
 * Structural subset of `MutableDecisionService` the runner and model derivation need — pass the
 * dev-build instance (`@edgerules/node/mutable` or `@edgerules/web/mutable`) directly. Declared
 * locally so this package keeps no hard dependency on a specific engine package version, matching
 * `DecisionTableEditor`'s and `BoxedEditor`'s own local redeclarations.
 */
export interface MutableDecisionService {
  get(path: string, filter?: GetFilter): PortableNode | PortableError;
  execute(method: string, input?: Record<string, unknown>): Promise<unknown>;
  toPortable(): PortableRootContext;
  requiresSolver(): boolean;
  // Set by the host via `registerSolver(...)`; `TestRunner` only ever reads it, to pre-flight a run
  // against an `optimise`-declaring model with no solver registered.
  readonly solverHandler?: unknown;
}

export type TestSubjectKind = 'model' | 'function' | 'ruleset' | 'optimise' | 'loop';

export interface TestSubject {
  id: TestSubjectId; // '*' or the callable's dotted path.
  kind: TestSubjectKind;
  name: string; // Label in the Path column header: the model name for '*', otherwise the dotted path.
}

export interface TestRunner {
  // Runs one case: binds its Inputs cells, executes the subject, writes results through TestCasesService.
  run(testCaseId: string): Promise<void>;

  // Runs every case of the subject, sequentially.
  runAll(): Promise<void>;

  // Test case ids with a run in flight; drives the per-column running indicator.
  getRunning(): readonly string[];

  subscribe(listener: () => void): Unsubscribe;
}

export type { TestResultSet, TestSubjectId };
