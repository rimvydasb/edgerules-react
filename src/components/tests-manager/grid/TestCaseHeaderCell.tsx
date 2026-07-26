import { useState, useSyncExternalStore, type ReactElement } from 'react';
import type { TestCase } from '../../test-cases-service';
import { useTestsManagerContext } from '../context/TestsManagerContext';
import { testCaseActionsFor } from '../menu/actions';
import { TestsMenu } from '../menu/TestsMenu';

// Case name, three-dots menu, run indicator.
export function TestCaseHeaderCell({
  testCase,
}: {
  testCase: TestCase;
}): ReactElement {
  const { testCases, runner, readOnly } = useTestsManagerContext();
  const running = useSyncExternalStore(runner.subscribe, runner.getRunning);
  const isRunning = running.includes(testCase.id);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(testCase.name);

  const commitName = (): void => {
    if (draftName.trim() !== '' && draftName !== testCase.name) {
      testCases.renameTestCase(testCase.id, draftName);
    }
    setEditing(false);
  };

  const startRename = (): void => {
    setDraftName(testCase.name);
    setEditing(true);
  };

  return (
    <span
      data-testid={`case-header-${testCase.id}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      {editing ? (
        <input
          aria-label={`rename ${testCase.name}`}
          value={draftName}
          autoFocus
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      ) : (
        <span onDoubleClick={() => !readOnly && startRename()}>
          {testCase.name}
        </span>
      )}
      {isRunning ? (
        <span data-testid={`running-${testCase.id}`}>⏳</span>
      ) : null}
      {!readOnly && (
        <button
          type="button"
          aria-label={`case menu ${testCase.name}`}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          ⋮
        </button>
      )}
      <TestsMenu
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        actions={testCaseActionsFor(testCase, testCases, runner, startRename)}
      />
    </span>
  );
}
