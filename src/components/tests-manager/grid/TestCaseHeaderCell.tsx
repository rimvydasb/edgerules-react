import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, useSyncExternalStore, type CSSProperties, type ReactElement } from 'react';
import type { TestCase } from '../../test-cases-service';
import { useTestsManagerContext } from '../context/TestsManagerContext';
import { testCaseActionsFor } from '../menu/actions';
import { TestsMenu } from '../menu/TestsMenu';
import { ICON_CELL_WIDTH } from './wrapping';

// Three fixed parts: a 40x40 drag handle (reorders the column via `useColumnDrag`'s
// `DndContext`/`SortableContext`), the click-to-edit case name, and a 40x40 three-dots menu.
export function TestCaseHeaderCell({
  testCase,
}: {
  testCase: TestCase;
}): ReactElement {
  const { testCasesService, runner, readOnly } = useTestsManagerContext();
  const running = useSyncExternalStore(runner.subscribe, runner.getRunning);
  const isRunning = running.includes(testCase.id);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(testCase.name);
  const sortable = useSortable({ id: testCase.id, disabled: readOnly });

  const commitName = (): void => {
    if (draftName.trim() !== '' && draftName !== testCase.name) {
      testCasesService.renameTestCase(testCase.id, draftName);
    }
    setEditing(false);
  };

  const startRename = (): void => {
    setDraftName(testCase.name);
    setEditing(true);
  };

  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'stretch',
    boxSizing: 'border-box',
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <span ref={sortable.setNodeRef} data-testid={`case-header-${testCase.id}`} style={style}>
      {!readOnly && (
        <span
          aria-label={`drag ${testCase.name}`}
          {...sortable.attributes}
          {...sortable.listeners}
          style={{
            width: ICON_CELL_WIDTH,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
          }}
        >
          <DragIndicatorIcon fontSize="small" />
        </span>
      )}
      <span
        onClick={() => !readOnly && !editing && startRename()}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 4px',
          overflow: 'hidden',
          cursor: readOnly ? 'default' : 'text',
        }}
      >
        {editing ? (
          <input
            aria-label={`rename ${testCase.name}`}
            value={draftName}
            autoFocus
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        ) : (
          <span
            style={{
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              whiteSpace: 'normal',
            }}
          >
            {testCase.name}
          </span>
        )}
        {isRunning ? <span data-testid={`running-${testCase.id}`}>⏳</span> : null}
      </span>
      {!readOnly && (
        <span
          style={{
            width: ICON_CELL_WIDTH,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
        actions={testCaseActionsFor(testCase, testCasesService, runner)}
      />
    </span>
  );
}
