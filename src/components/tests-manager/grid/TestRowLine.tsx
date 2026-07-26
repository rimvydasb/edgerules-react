import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type CSSProperties, type ReactElement } from 'react';
import type { TestCase, TestRow } from '../../test-cases-service';
import { useTestsManagerContext } from '../context/TestsManagerContext';
import { qualifyPath } from '../model/inputs';
import { rowActionsFor } from '../menu/actions';
import { TestsMenu } from '../menu/TestsMenu';
import { AssertionCell } from './AssertionCell';
import { InputCell } from './InputCell';
import { ValidationCell } from './ValidationCell';

export const ROW_HEIGHT = 40;

// One row: drag handle, path cell, description cell, its case cells.
export function TestRowLine({
  row,
  visibleCases,
}: {
  row: TestRow;
  visibleCases: TestCase[];
}): ReactElement {
  const { testCases, documentationService, subject, readOnly } =
    useTestsManagerContext();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const sortable = useSortable({ id: row.path, disabled: readOnly });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    height: ROW_HEIGHT,
  };

  const qualifiedPath = qualifyPath(subject.id, row.path);
  const description = documentationService?.getDescription(qualifiedPath) ?? '';

  return (
    <TableRow
      ref={sortable.setNodeRef}
      style={style}
      data-testid={`row-${row.path || '(result)'}`}
    >
      <TableCell
        sx={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          backgroundColor: 'background.paper',
          whiteSpace: 'nowrap',
        }}
      >
        {!readOnly && (
          <span
            aria-label={`drag ${row.path}`}
            {...sortable.attributes}
            {...sortable.listeners}
            style={{ cursor: 'grab', marginRight: 4, display: 'inline-block' }}
          >
            ::
          </span>
        )}
        <Tooltip title={row.type ?? ''}>
          <span>{row.path === '' ? '(result)' : row.path}</span>
        </Tooltip>
        {!readOnly && (
          <button
            type="button"
            aria-label={`row menu ${row.path}`}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              marginLeft: 4,
            }}
          >
            ⋮
          </button>
        )}
        <TestsMenu
          anchorEl={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          actions={rowActionsFor(row, testCases)}
        />
      </TableCell>
      <TableCell
        sx={{
          position: 'sticky',
          left: 160,
          zIndex: 1,
          backgroundColor: 'background.paper',
        }}
      >
        {documentationService ? (
          <input
            aria-label={`description ${row.path}`}
            value={description}
            disabled={readOnly}
            onChange={(event) =>
              documentationService.setDescription(
                qualifiedPath,
                event.target.value,
              )
            }
            style={{ border: 'none', width: '100%', background: 'transparent' }}
          />
        ) : null}
      </TableCell>
      {visibleCases.map((testCase) => (
        <TableCell key={testCase.id}>
          {row.section === 'inputs' && (
            <InputCell testCaseId={testCase.id} row={row} />
          )}
          {row.section === 'assertions' && (
            <AssertionCell testCaseId={testCase.id} row={row} />
          )}
          {row.section === 'validations' && (
            <ValidationCell testCaseId={testCase.id} row={row} />
          )}
        </TableCell>
      ))}
    </TableRow>
  );
}
