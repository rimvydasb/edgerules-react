import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { TestCasesService } from '../../test-cases-service';
import type {
  MutableDecisionService,
  TestRunner,
  TestSubject,
} from '../tests-manager-types';

// Structural subset of the future `edgerules-react/documentation-service` package's
// `DocumentationService` — declared locally, like `MutableDecisionService`, so this package has no
// hard dependency on that package existing yet. The Description column is read-only without one.
export interface DocumentationService {
  getDescription(path: string): string | undefined;
  setDescription(path: string, description: string): void;
  subscribe(listener: () => void): () => void;
}

export interface TestsManagerContextValue {
  service: MutableDecisionService;
  testCasesService: TestCasesService;
  runner: TestRunner;
  documentationService?: DocumentationService;
  subject: TestSubject;
  readOnly: boolean;
  revision?: string | number;
  pageSize: number;
  autoRun: boolean;
}

const TestsManagerContext = createContext<TestsManagerContextValue | undefined>(
  undefined,
);

export function TestsManagerProvider({
  value,
  children,
}: {
  value: TestsManagerContextValue;
  children: ReactNode;
}): ReactElement {
  return (
    <TestsManagerContext.Provider value={value}>
      {children}
    </TestsManagerContext.Provider>
  );
}

export function useTestsManagerContext(): TestsManagerContextValue {
  const context = useContext(TestsManagerContext);
  if (!context) {
    throw new Error(
      'useTestsManagerContext must be used within a TestsManagerProvider',
    );
  }
  return context;
}
