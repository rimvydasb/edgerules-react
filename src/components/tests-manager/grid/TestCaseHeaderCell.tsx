import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useState, useSyncExternalStore, type ReactElement } from 'react';
import type { TestCase } from '../../test-cases-service';
import { useTestsManagerContext } from '../context/TestsManagerContext';
import { testCaseActionsFor } from '../menu/actions';
import { TestsMenu } from '../menu/TestsMenu';
import { ICON_CELL_WIDTH } from './wrapping';

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
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 4,
        padding: '8px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
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
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      ) : (
        <span
          onDoubleClick={() => !readOnly && startRename()}
          style={{
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            whiteSpace: 'normal',
          }}
        >
          {testCase.name}
        </span>
      )}
      {isRunning ? (
        <span data-testid={`running-${testCase.id}`}>⏳</span>
      ) : null}
      {!readOnly && (
        <span
          style={{
            width: ICON_CELL_WIDTH,
            height: ICON_CELL_WIDTH,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginLeft: 'auto',
          }}
        >
          <button
            type="button"
            aria-label={`case menu ${testCase.name}`}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MoreVertIcon fontSize="small" />
          </button>
        </span>
      )}
      <TestsMenu
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        actions={testCaseActionsFor(testCase, testCases, runner, startRename)}
      />
    </span>
  );
}
